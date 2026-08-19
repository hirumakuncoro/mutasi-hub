import type { SQL } from "bun";

import { toIsoTimestamp, type DbTimestamp } from "./timestamp";

export type ProviderTransaction = {
  id: number;
  merchantId: string;
  providerTransactionId: string;
  amount: number;
  status: string;
  paymentType: string;
  transactionTime: string;
  rawJson: string;
  createdAt: string;
};

type ProviderTransactionRow = {
  id: number;
  merchant_id: string;
  provider_transaction_id: string;
  amount: number;
  status: string;
  payment_type: string;
  transaction_time: DbTimestamp;
  raw_json: string;
  created_at: DbTimestamp;
};

export type SaveProviderTransactionInput = {
  merchantId: string;
  providerTransactionId: string;
  amount: number;
  status: string;
  paymentType: string;
  transactionTime: string;
  rawJson: unknown;
};

export class ProviderTransactionRepository {
  constructor(private readonly sql: SQL) {}

  async save(
    input: SaveProviderTransactionInput,
  ): Promise<{ id: number | null; inserted: boolean }> {
    const rows = await this.sql<{ id: number }[]>`
      INSERT INTO provider_transactions (
        merchant_id,
        provider_transaction_id,
        amount,
        status,
        payment_type,
        transaction_time,
        raw_json
      )
      VALUES (
        ${input.merchantId},
        ${input.providerTransactionId},
        ${input.amount},
        ${input.status},
        ${input.paymentType},
        ${input.transactionTime}::timestamptz,
        ${this.serializeRawJson(input.rawJson)}
      )
      ON CONFLICT (merchant_id, provider_transaction_id) DO NOTHING
      RETURNING id
    `;

    if (rows[0]) {
      return { id: rows[0].id, inserted: true };
    }

    const existing = await this.findByProviderTransactionId(
      input.merchantId,
      input.providerTransactionId,
    );

    return { id: existing?.id ?? null, inserted: false };
  }

  async store(
    input: SaveProviderTransactionInput,
  ): Promise<{ id: number | null; inserted: boolean }> {
    return this.save(input);
  }

  async findByProviderTransactionId(
    merchantId: string,
    providerTransactionId: string,
  ): Promise<ProviderTransaction | null> {
    const [row] = await this.sql<ProviderTransactionRow[]>`
      SELECT *
      FROM provider_transactions
      WHERE merchant_id = ${merchantId}
        AND provider_transaction_id = ${providerTransactionId}
      LIMIT 1
    `;

    return row ? this.toEntity(row) : null;
  }

  async exists(
    merchantId: string,
    providerTransactionId: string,
  ): Promise<boolean> {
    const [row] = await this.sql<{ id: number }[]>`
      SELECT id
      FROM provider_transactions
      WHERE merchant_id = ${merchantId}
        AND provider_transaction_id = ${providerTransactionId}
      LIMIT 1
    `;

    return Boolean(row);
  }

  async updateStatus(
    merchantId: string,
    providerTransactionId: string,
    status: string,
  ): Promise<boolean> {
    const rows = await this.sql<{ id: number }[]>`
      UPDATE provider_transactions
      SET status = ${status}
      WHERE merchant_id = ${merchantId}
        AND provider_transaction_id = ${providerTransactionId}
      RETURNING id
    `;

    return rows.length > 0;
  }

  private serializeRawJson(rawJson: unknown): string {
    return typeof rawJson === "string" ? rawJson : JSON.stringify(rawJson);
  }

  private toEntity(row: ProviderTransactionRow): ProviderTransaction {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      providerTransactionId: row.provider_transaction_id,
      amount: row.amount,
      status: row.status,
      paymentType: row.payment_type,
      transactionTime: toIsoTimestamp(row.transaction_time),
      rawJson: row.raw_json,
      createdAt: toIsoTimestamp(row.created_at),
    };
  }
}
