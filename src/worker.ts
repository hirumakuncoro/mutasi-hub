import type { AppConfig } from "./config";
import type { Logger } from "./logger";
import { MerchantPollingStateRepository } from "./repositories/merchantPollingStateRepository";
import {
  GoBizTransactionClient,
  GoBizUnauthorizedError,
} from "./services/gobizTransactionClient";
import { GoBizSessionService } from "./services/gobizSessionService";
import { PaymentMatchingService } from "./services/paymentMatchingService";

export class PollingWorker {
  private timer: Timer | null = null;
  private running = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly pollingStateRepository: MerchantPollingStateRepository,
    private readonly gobizSessionService: GoBizSessionService,
    private readonly gobizTransactionClient: GoBizTransactionClient,
    private readonly paymentMatchingService: PaymentMatchingService,
  ) {}

  start(): void {
    if (this.running) return;

    this.running = true;
    this.logger.info("polling worker started", {
      merchantId: this.config.merchantId,
      pollingMinMs: this.config.pollingMinMs,
      pollingMaxMs: this.config.pollingMaxMs,
      pollingOverlapMs: this.config.pollingOverlapMs,
      pollingInitialLookbackMs: this.config.pollingInitialLookbackMs,
    });

    this.scheduleNext(0);
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.logger.info("polling worker stopped");
  }

  private scheduleNext(delayMs = this.getNextDelayMs()): void {
    if (!this.running) return;

    this.logger.debug("next polling tick scheduled", { delayMs });
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      const session = await this.gobizSessionService.getActiveSession(
        this.config.merchantId,
      );

      if (!session) {
        this.logger.warn("active merchant session not available, skipping polling tick", {
          merchantId: this.config.merchantId,
        });
        return;
      }

      const window = await this.getPollingWindow();
      this.logger.debug("polling window resolved", {
        merchantId: this.config.merchantId,
        startTime: window.startTime,
        endTime: window.endTime,
      });

      const transactions = await this.fetchTransactionsWithRefresh(window, session);
      let latestTransactionTime: string | null = null;
      let storedCount = 0;
      let matchedCount = 0;
      let ambiguousCount = 0;

      const expiredCount = await this.paymentMatchingService.expirePendingIntents(
        window.endTime,
      );
      if (expiredCount > 0) {
        this.logger.debug("expired pending intents", { expiredCount });
      }

      for (const transaction of transactions) {
        const result = await this.paymentMatchingService.processTransaction(transaction);

        this.logger.debug("provider transaction processed", {
          providerTransactionId: result.providerTransactionId,
          transactionTime: result.transactionTime,
          stored: result.stored,
          matched: result.matched,
          ambiguous: result.ambiguous,
        });

        if (result.stored) storedCount += 1;
        if (result.matched) matchedCount += 1;
        if (result.ambiguous) ambiguousCount += 1;
        if (result.transactionTime) {
          latestTransactionTime = this.maxIsoTime(
            latestTransactionTime,
            result.transactionTime,
          );
        }
      }

      if (latestTransactionTime) {
        await this.pollingStateRepository.updateLastSeenTransactionTime(
          this.config.merchantId,
          latestTransactionTime,
        );
        this.logger.debug("polling cursor updated", {
          merchantId: this.config.merchantId,
          lastSeenTransactionTime: latestTransactionTime,
        });
      }

      this.logger.info("polling tick completed", {
        merchantId: this.config.merchantId,
        startTime: window.startTime,
        endTime: window.endTime,
        transactionCount: transactions.length,
        storedCount,
        matchedCount,
        ambiguousCount,
        latestTransactionTime,
      });
    } catch (error) {
      this.logger.error("polling tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.scheduleNext();
    }
  }

  private getNextDelayMs(): number {
    const { pollingMinMs, pollingMaxMs } = this.config;
    const range = pollingMaxMs - pollingMinMs;

    return pollingMinMs + Math.floor(Math.random() * (range + 1));
  }

  private async getPollingWindow(): Promise<{ startTime: string; endTime: string }> {
    const state = await this.pollingStateRepository.findByMerchantId(
      this.config.merchantId,
    );
    const endDate = new Date();
    const startDate = state?.lastSeenTransactionTime
      ? new Date(Date.parse(state.lastSeenTransactionTime) - this.config.pollingOverlapMs)
      : new Date(endDate.getTime() - this.config.pollingInitialLookbackMs);

    return {
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    };
  }

  private async fetchTransactionsWithRefresh(
    window: { startTime: string; endTime: string },
    session: Awaited<ReturnType<GoBizSessionService["getActiveSession"]>>,
  ) {
    if (!session) return [];

    try {
      const transactions = await this.gobizTransactionClient.fetchTransactions({
        merchantId: this.config.merchantId,
        session,
        startTime: window.startTime,
        endTime: window.endTime,
      });
      this.logger.debug("gobiz transactions fetched", {
        merchantId: this.config.merchantId,
        count: transactions.length,
      });

      return transactions;
    } catch (error) {
      if (!(error instanceof GoBizUnauthorizedError)) {
        throw error;
      }

      this.logger.warn("gobiz transaction request unauthorized, refreshing session", {
        merchantId: this.config.merchantId,
      });

      const refreshedSession = await this.gobizSessionService.refreshAfterUnauthorized(
        this.config.merchantId,
      );

      if (!refreshedSession) {
        this.logger.warn("gobiz session refresh failed, polling tick skipped", {
          merchantId: this.config.merchantId,
        });
        return [];
      }

      const transactions = await this.gobizTransactionClient.fetchTransactions({
        merchantId: this.config.merchantId,
        session: refreshedSession,
        startTime: window.startTime,
        endTime: window.endTime,
      });
      this.logger.debug("gobiz transactions fetched after refresh", {
        merchantId: this.config.merchantId,
        count: transactions.length,
      });

      return transactions;
    }
  }

  private maxIsoTime(current: string | null, candidate: string): string {
    if (!current) return candidate;

    return Date.parse(candidate) > Date.parse(current) ? candidate : current;
  }
}
