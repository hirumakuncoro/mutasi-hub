import { EventDeliveryRepository } from "../repositories/eventDeliveryRepository";
import { PaymentIntentRepository } from "../repositories/paymentIntentRepository";
import { ProviderTransactionRepository } from "../repositories/providerTransactionRepository";
import type { GoBizTransaction } from "./gobizTransactionClient";

export type ProcessTransactionResult = {
  stored: boolean;
  matched: boolean;
  ambiguous: boolean;
  providerTransactionId: string | null;
  transactionTime: string | null;
};

export class PaymentMatchingService {
  constructor(
    private readonly providerTransactionRepository: ProviderTransactionRepository,
    private readonly paymentIntentRepository: PaymentIntentRepository,
    private readonly eventDeliveryRepository: EventDeliveryRepository,
  ) {}

  async expirePendingIntents(now: string): Promise<number> {
    return this.paymentIntentRepository.expireBefore(now);
  }

  async processTransaction(
    transaction: GoBizTransaction,
  ): Promise<ProcessTransactionResult> {
    const providerTransactionId = this.resolveProviderTransactionId(transaction);
    const merchantId = transaction.merchant_id;
    const providerAmount = this.resolveAmount(transaction);
    const intentAmount = this.resolveIntentAmount(providerAmount);
    const status = transaction.transaction_status;
    const paymentType = transaction.payment_type;
    const transactionTime = this.resolveTransactionTime(transaction);
    if (
      !providerTransactionId ||
      !merchantId ||
      providerAmount === null ||
      intentAmount === null ||
      !status ||
      !paymentType ||
      !transactionTime
    ) {
      return {
        stored: false,
        matched: false,
        ambiguous: false,
        providerTransactionId: providerTransactionId ?? null,
        transactionTime: transactionTime ?? null,
      };
    }

    const saved = await this.providerTransactionRepository.save({
      merchantId,
      providerTransactionId,
      amount: providerAmount,
      status,
      paymentType,
      transactionTime,
      rawJson: transaction,
    });

    if (!saved.inserted || !this.isPaidQrisTransaction(status, paymentType)) {
      return {
        stored: saved.inserted,
        matched: false,
        ambiguous: false,
        providerTransactionId,
        transactionTime,
      };
    }

    const candidates = await this.paymentIntentRepository.findPendingCandidates({
      merchantId,
      amount: intentAmount,
      transactionTime,
    });

    if (candidates.length === 0) {
      return {
        stored: true,
        matched: false,
        ambiguous: false,
        providerTransactionId,
        transactionTime,
      };
    }

    if (candidates.length > 1) {
      await Promise.all(
        candidates.map((candidate) =>
          this.paymentIntentRepository.markAmbiguous(candidate.id),
        ),
      );

      return {
        stored: true,
        matched: false,
        ambiguous: true,
        providerTransactionId,
        transactionTime,
      };
    }

    const intent = candidates[0];
    if (!intent) {
      return {
        stored: true,
        matched: false,
        ambiguous: false,
        providerTransactionId,
        transactionTime,
      };
    }

    const paidAt = transactionTime;
    const markedPaid = await this.paymentIntentRepository.markPaid({
      id: intent.id,
      matchedProviderTransactionId: providerTransactionId,
      paidAt,
    });

    if (!markedPaid) {
      return {
        stored: true,
        matched: false,
        ambiguous: false,
        providerTransactionId,
        transactionTime,
      };
    }

    await this.eventDeliveryRepository.save({
      providerTransactionId,
      eventType: "payment.paid",
      url: intent.webhookUrl,
      payloadJson: {
        event: "payment.paid",
        intent_id: intent.id,
        platform: intent.platform,
        external_id: intent.externalId,
        merchant_id: intent.merchantId,
        amount: intent.amount,
        paid_at: paidAt,
        provider_transaction_id: providerTransactionId,
      },
    });

    return {
      stored: true,
      matched: true,
      ambiguous: false,
      providerTransactionId,
      transactionTime,
    };
  }

  private resolveProviderTransactionId(transaction: GoBizTransaction): string | null {
    return (
      transaction.id ??
      transaction.wallstreet_transaction_id ??
      transaction.order_id ??
      null
    );
  }

  private resolveAmount(transaction: GoBizTransaction): number | null {
    if (typeof transaction.gross_amount === "number") return transaction.gross_amount;
    if (typeof transaction.real_gross_amount === "number") {
      return transaction.real_gross_amount;
    }

    return null;
  }

  private resolveIntentAmount(providerAmount: number | null): number | null {
    if (providerAmount === null || providerAmount % 100 !== 0) return null;
    return providerAmount / 100;
  }

  private resolveTransactionTime(transaction: GoBizTransaction): string | null {
    return transaction.transaction_time ?? transaction.settlement_time ?? null;
  }

  private isPaidQrisTransaction(status: string, paymentType: string): boolean {
    return (
      paymentType.toUpperCase() === "QRIS" &&
      (status.toUpperCase() === "SETTLEMENT" || status.toUpperCase() === "CAPTURE")
    );
  }
}
