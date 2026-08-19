import type { SQL } from "bun";

import { toIsoTimestamp, toNullableIsoTimestamp, type DbTimestamp } from "./timestamp";

export type MerchantSessionStatus = "ACTIVE" | "RELOGIN_REQUIRED";

export type MerchantSession = {
  merchantId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  status: MerchantSessionStatus;
  updatedAt: string;
};

type MerchantSessionRow = {
  merchant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: DbTimestamp | null;
  status: MerchantSessionStatus;
  updated_at: DbTimestamp;
};

export type SaveMerchantSessionInput = {
  merchantId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: string | null;
  status?: MerchantSessionStatus;
};

export class MerchantSessionRepository {
  constructor(private readonly sql: SQL) {}

  async save(input: SaveMerchantSessionInput): Promise<void> {
    await this.sql`
      INSERT INTO merchant_sessions (
        merchant_id,
        access_token,
        refresh_token,
        expires_at,
        status,
        updated_at
      )
      VALUES (
        ${input.merchantId},
        ${input.accessToken},
        ${input.refreshToken},
        ${input.expiresAt ?? null}::timestamptz,
        ${input.status ?? "ACTIVE"},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(merchant_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  async store(input: SaveMerchantSessionInput): Promise<void> {
    await this.save(input);
  }

  async findByMerchantId(merchantId: string): Promise<MerchantSession | null> {
    const [row] = await this.sql<MerchantSessionRow[]>`
      SELECT *
      FROM merchant_sessions
      WHERE merchant_id = ${merchantId}
      LIMIT 1
    `;

    return row ? this.toEntity(row) : null;
  }

  async updateTokens(
    merchantId: string,
    input: {
      accessToken: string;
      refreshToken: string;
      expiresAt?: string | null;
    },
  ): Promise<boolean> {
    const rows = await this.sql<{ merchant_id: string }[]>`
      UPDATE merchant_sessions
      SET
        access_token = ${input.accessToken},
        refresh_token = ${input.refreshToken},
        expires_at = ${input.expiresAt ?? null}::timestamptz,
        status = 'ACTIVE',
        updated_at = CURRENT_TIMESTAMP
      WHERE merchant_id = ${merchantId}
      RETURNING merchant_id
    `;

    return rows.length > 0;
  }

  async updateStatus(
    merchantId: string,
    status: MerchantSessionStatus,
  ): Promise<boolean> {
    const rows = await this.sql<{ merchant_id: string }[]>`
      UPDATE merchant_sessions
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE merchant_id = ${merchantId}
      RETURNING merchant_id
    `;

    return rows.length > 0;
  }

  private toEntity(row: MerchantSessionRow): MerchantSession {
    return {
      merchantId: row.merchant_id,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: toNullableIsoTimestamp(row.expires_at),
      status: row.status,
      updatedAt: toIsoTimestamp(row.updated_at),
    };
  }
}
