import type { SQL } from "bun";

import { toIsoTimestamp, toNullableIsoTimestamp, type DbTimestamp } from "./timestamp";

export type MerchantPollingState = {
  merchantId: string;
  lastSeenTransactionTime: string | null;
  updatedAt: string;
};

type MerchantPollingStateRow = {
  merchant_id: string;
  last_seen_transaction_time: DbTimestamp | null;
  updated_at: DbTimestamp;
};

export class MerchantPollingStateRepository {
  constructor(private readonly sql: SQL) {}

  async save(input: {
    merchantId: string;
    lastSeenTransactionTime?: string | null;
  }): Promise<void> {
    await this.sql`
      INSERT INTO merchant_polling_states (
        merchant_id,
        last_seen_transaction_time,
        updated_at
      )
      VALUES (
        ${input.merchantId},
        ${input.lastSeenTransactionTime ?? null}::timestamptz,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(merchant_id) DO UPDATE SET
        last_seen_transaction_time = excluded.last_seen_transaction_time,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  async store(input: {
    merchantId: string;
    lastSeenTransactionTime?: string | null;
  }): Promise<void> {
    await this.save(input);
  }

  async findByMerchantId(merchantId: string): Promise<MerchantPollingState | null> {
    const [row] = await this.sql<MerchantPollingStateRow[]>`
      SELECT *
      FROM merchant_polling_states
      WHERE merchant_id = ${merchantId}
      LIMIT 1
    `;

    return row ? this.toEntity(row) : null;
  }

  async updateLastSeenTransactionTime(
    merchantId: string,
    transactionTime: string,
  ): Promise<void> {
    await this.save({ merchantId, lastSeenTransactionTime: transactionTime });
  }

  private toEntity(row: MerchantPollingStateRow): MerchantPollingState {
    return {
      merchantId: row.merchant_id,
      lastSeenTransactionTime: toNullableIsoTimestamp(row.last_seen_transaction_time),
      updatedAt: toIsoTimestamp(row.updated_at),
    };
  }
}
