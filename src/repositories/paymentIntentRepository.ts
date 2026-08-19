import type { SQL } from "bun";

import { toIsoTimestamp, toNullableIsoTimestamp, type DbTimestamp } from "./timestamp";

export type PaymentIntentStatus = "PENDING" | "PAID" | "EXPIRED" | "AMBIGUOUS";

export type PaymentIntent = {
  id: number;
  platform: string;
  externalId: string;
  merchantId: string;
  amount: number;
  status: PaymentIntentStatus;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  matchedProviderTransactionId: string | null;
  webhookUrl: string;
};

type PaymentIntentRow = {
  id: number;
  platform: string;
  external_id: string;
  merchant_id: string;
  amount: number;
  status: PaymentIntentStatus;
  created_at: DbTimestamp;
  expires_at: DbTimestamp;
  paid_at: DbTimestamp | null;
  matched_provider_transaction_id: string | null;
  webhook_url: string;
};

export type SavePaymentIntentInput = {
  platform: string;
  externalId: string;
  merchantId: string;
  amount: number;
  createdAt: string;
  expiresAt: string;
  webhookUrl: string;
};

export class PaymentIntentRepository {
  constructor(private readonly sql: SQL) {}

  async save(input: SavePaymentIntentInput): Promise<{ id: number | null; inserted: boolean }> {
    const rows = await this.sql<{ id: number }[]>`
      INSERT INTO payment_intents (
        platform,
        external_id,
        merchant_id,
        amount,
        created_at,
        expires_at,
        webhook_url
      )
      VALUES (
        ${input.platform},
        ${input.externalId},
        ${input.merchantId},
        ${input.amount},
        ${input.createdAt}::timestamptz,
        ${input.expiresAt}::timestamptz,
        ${input.webhookUrl}
      )
      ON CONFLICT (platform, external_id) DO NOTHING
      RETURNING id
    `;

    if (rows[0]) {
      return { id: this.toNumberId(rows[0].id), inserted: true };
    }

    const existing = await this.findByPlatformExternalId(input.platform, input.externalId);
    return { id: existing?.id ?? null, inserted: false };
  }

  async store(input: SavePaymentIntentInput): Promise<{ id: number | null; inserted: boolean }> {
    return this.save(input);
  }

  async findById(id: number): Promise<PaymentIntent | null> {
    const [row] = await this.sql<PaymentIntentRow[]>`
      SELECT *
      FROM payment_intents
      WHERE id = ${id}
      LIMIT 1
    `;

    return row ? this.toEntity(row) : null;
  }

  async findByPlatformExternalId(
    platform: string,
    externalId: string,
  ): Promise<PaymentIntent | null> {
    const [row] = await this.sql<PaymentIntentRow[]>`
      SELECT *
      FROM payment_intents
      WHERE platform = ${platform}
        AND external_id = ${externalId}
      LIMIT 1
    `;

    return row ? this.toEntity(row) : null;
  }

  async findPendingCandidates(input: {
    merchantId: string;
    amount: number;
    transactionTime: string;
  }): Promise<PaymentIntent[]> {
    const rows = await this.sql<PaymentIntentRow[]>`
      SELECT *
      FROM payment_intents
      WHERE merchant_id = ${input.merchantId}
        AND amount = ${input.amount}
        AND status = 'PENDING'
        AND created_at <= ${input.transactionTime}::timestamptz
        AND expires_at >= ${input.transactionTime}::timestamptz
      ORDER BY created_at ASC
    `;

    return rows.map((row) => this.toEntity(row));
  }

  async markPaid(input: {
    id: number;
    matchedProviderTransactionId: string;
    paidAt: string;
  }): Promise<boolean> {
    const rows = await this.sql<{ id: number }[]>`
      UPDATE payment_intents
      SET
        status = 'PAID',
        paid_at = ${input.paidAt}::timestamptz,
        matched_provider_transaction_id = ${input.matchedProviderTransactionId}
      WHERE id = ${input.id}
        AND status = 'PENDING'
        AND matched_provider_transaction_id IS NULL
      RETURNING id
    `;

    return rows.length > 0;
  }

  async markAmbiguous(id: number): Promise<boolean> {
    return this.updateStatus(id, "AMBIGUOUS");
  }

  async expireBefore(now: string): Promise<number> {
    const rows = await this.sql<{ id: number }[]>`
      UPDATE payment_intents
      SET status = 'EXPIRED'
      WHERE status = 'PENDING'
        AND expires_at < ${now}::timestamptz
      RETURNING id
    `;

    return rows.length;
  }

  async updateStatus(id: number, status: PaymentIntentStatus): Promise<boolean> {
    const rows = await this.sql<{ id: number }[]>`
      UPDATE payment_intents
      SET status = ${status}
      WHERE id = ${id}
      RETURNING id
    `;

    return rows.length > 0;
  }

  private toEntity(row: PaymentIntentRow): PaymentIntent {
    return {
      id: this.toNumberId(row.id),
      platform: row.platform,
      externalId: row.external_id,
      merchantId: row.merchant_id,
      amount: row.amount,
      status: row.status,
      createdAt: toIsoTimestamp(row.created_at),
      expiresAt: toIsoTimestamp(row.expires_at),
      paidAt: toNullableIsoTimestamp(row.paid_at),
      matchedProviderTransactionId: row.matched_provider_transaction_id,
      webhookUrl: row.webhook_url,
    };
  }

  private toNumberId(id: number | string): number {
    return typeof id === "number" ? id : Number(id);
  }
}
