import type { AppConfig } from "./config";
import type { Logger } from "./logger";
import { EventDeliveryRepository } from "./repositories/eventDeliveryRepository";

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class WebhookDeliveryWorker {
  private timer: Timer | null = null;
  private running = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly eventDeliveryRepository: EventDeliveryRepository,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  start(): void {
    if (this.running) return;

    this.running = true;
    this.logger.info("webhook delivery worker started", {
      intervalMs: this.config.webhookDeliveryIntervalMs,
      batchSize: this.config.webhookDeliveryBatchSize,
    });
    this.scheduleNext(0);
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.logger.info("webhook delivery worker stopped");
  }

  private scheduleNext(delayMs = this.config.webhookDeliveryIntervalMs): void {
    if (!this.running) return;

    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      const deliveries = await this.eventDeliveryRepository.findDue(
        new Date().toISOString(),
        this.config.webhookDeliveryBatchSize,
      );

      if (deliveries.length > 0) {
        this.logger.debug("webhook deliveries due", {
          count: deliveries.length,
        });
      }

      for (const delivery of deliveries) {
        await this.deliver(delivery.id, delivery.url, delivery.payloadJson);
      }
    } catch (error) {
      this.logger.error("webhook delivery tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.scheduleNext();
    }
  }

  private async deliver(id: number, url: string, payloadJson: string): Promise<void> {
    try {
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.internalApiKey}`,
          "content-type": "application/json",
        },
        body: payloadJson,
      });

      if (response.ok) {
        await this.eventDeliveryRepository.markSent(id, new Date().toISOString());
        this.logger.debug("webhook delivery sent", {
          deliveryId: id,
          status: response.status,
        });
        return;
      }

      await this.markFailed(id, `HTTP ${response.status}`);
    } catch (error) {
      await this.markFailed(
        id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async markFailed(id: number, error: string): Promise<void> {
    const delivery = await this.eventDeliveryRepository.findById(id);
    const attemptCount = delivery ? delivery.attemptCount + 1 : 1;

    await this.eventDeliveryRepository.markFailed({
      id,
      lastError: error.slice(0, 500),
      nextAttemptAt: this.nextAttemptAt(attemptCount),
    });
    this.logger.warn("webhook delivery failed, retry scheduled", {
      deliveryId: id,
      attemptCount,
      error: error.slice(0, 120),
    });
  }

  private nextAttemptAt(attemptCount: number): string {
    const delayMs = Math.min(60_000, 2_000 * 2 ** Math.max(0, attemptCount - 1));
    return new Date(Date.now() + delayMs).toISOString();
  }
}
