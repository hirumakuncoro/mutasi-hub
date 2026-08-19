import { SQL } from "bun";

import type { Logger } from "./logger";

export class DatabaseClient {
  private readonly sql: SQL;

  constructor(
    databaseUrl: string,
    private readonly logger: Logger,
  ) {
    this.sql = new SQL(databaseUrl);
  }

  async migrate(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS merchant_sessions (
        merchant_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS merchant_polling_states (
        merchant_id TEXT PRIMARY KEY,
        last_seen_transaction_time TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS payment_intents (
        id BIGSERIAL PRIMARY KEY,
        platform TEXT NOT NULL,
        external_id TEXT NOT NULL,
        merchant_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        paid_at TIMESTAMPTZ,
        matched_provider_transaction_id TEXT,
        webhook_url TEXT NOT NULL,
        UNIQUE(platform, external_id),
        UNIQUE(matched_provider_transaction_id)
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS provider_transactions (
        id BIGSERIAL PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        provider_transaction_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        payment_type TEXT NOT NULL,
        transaction_time TIMESTAMPTZ NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(merchant_id, provider_transaction_id)
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS event_deliveries (
        id BIGSERIAL PRIMARY KEY,
        provider_transaction_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        url TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMPTZ
      )
    `;

    await this.migrateTimestampColumns();
    this.logger.info("database migrated");
  }

  connection(): SQL {
    return this.sql;
  }

  async close(): Promise<void> {
    await this.sql.close();
    this.logger.info("database closed");
  }

  private async migrateTimestampColumns(): Promise<void> {
    const timestampColumns = [
      ["merchant_sessions", "expires_at"],
      ["merchant_sessions", "updated_at"],
      ["merchant_polling_states", "last_seen_transaction_time"],
      ["merchant_polling_states", "updated_at"],
      ["payment_intents", "created_at"],
      ["payment_intents", "expires_at"],
      ["payment_intents", "paid_at"],
      ["provider_transactions", "transaction_time"],
      ["provider_transactions", "created_at"],
      ["event_deliveries", "next_attempt_at"],
      ["event_deliveries", "created_at"],
      ["event_deliveries", "sent_at"],
    ] as const;

    for (const [table, column] of timestampColumns) {
      await this.sql.unsafe(`
        ALTER TABLE ${table}
        ALTER COLUMN ${column} TYPE TIMESTAMPTZ
        USING NULLIF(${column}::TEXT, '')::TIMESTAMPTZ
      `);
    }
  }
}
