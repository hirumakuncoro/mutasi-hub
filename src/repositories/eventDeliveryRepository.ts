import type { SQL } from "bun";

import { toIsoTimestamp, toNullableIsoTimestamp, type DbTimestamp } from "./timestamp";

export type EventDeliveryStatus = "PENDING" | "SENT" | "FAILED";

export type EventDelivery = {
  id: number;
  providerTransactionId: string;
  eventType: string;
  url: string;
  payloadJson: string;
  status: EventDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};

type EventDeliveryRow = {
  id: number;
  provider_transaction_id: string;
  event_type: string;
  url: string;
  payload_json: string;
  status: EventDeliveryStatus;
  attempt_count: number;
  next_attempt_at: DbTimestamp | null;
  last_error: string | null;
  created_at: DbTimestamp;
  sent_at: DbTimestamp | null;
};

export type SaveEventDeliveryInput = {
  providerTransactionId: string;
  eventType: string;
  url: string;
  payloadJson: unknown;
  nextAttemptAt?: string | null;
};

export class EventDeliveryRepository {
  constructor(private readonly sql: SQL) {}

  async save(input: SaveEventDeliveryInput): Promise<number> {
    const [row] = await this.sql<{ id: number }[]>`
      INSERT INTO event_deliveries (
        provider_transaction_id,
        event_type,
        url,
        payload_json,
        next_attempt_at
      )
      VALUES (
        ${input.providerTransactionId},
        ${input.eventType},
        ${input.url},
        ${this.serializePayload(input.payloadJson)},
        ${input.nextAttemptAt ?? null}::timestamptz
      )
      RETURNING id
    `;

    if (!row) {
      throw new Error("Failed to create event delivery");
    }

    return row.id;
  }

  async store(input: SaveEventDeliveryInput): Promise<number> {
    return this.save(input);
  }

  async findById(id: number): Promise<EventDelivery | null> {
    const [row] = await this.sql<EventDeliveryRow[]>`
      SELECT *
      FROM event_deliveries
      WHERE id = ${id}
      LIMIT 1
    `;

    return row ? this.toEntity(row) : null;
  }

  async findDue(now: string, limit = 20): Promise<EventDelivery[]> {
    const rows = await this.sql<EventDeliveryRow[]>`
      SELECT *
      FROM event_deliveries
      WHERE status IN ('PENDING', 'FAILED')
        AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}::timestamptz)
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;

    return rows.map((row) => this.toEntity(row));
  }

  async markSent(id: number, sentAt: string): Promise<boolean> {
    const rows = await this.sql<{ id: number }[]>`
      UPDATE event_deliveries
      SET status = 'SENT',
          sent_at = ${sentAt}::timestamptz,
          last_error = NULL
      WHERE id = ${id}
      RETURNING id
    `;

    return rows.length > 0;
  }

  async markFailed(input: {
    id: number;
    lastError: string;
    nextAttemptAt?: string | null;
  }): Promise<boolean> {
    const rows = await this.sql<{ id: number }[]>`
      UPDATE event_deliveries
      SET
        status = 'FAILED',
        attempt_count = attempt_count + 1,
        last_error = ${input.lastError},
        next_attempt_at = ${input.nextAttemptAt ?? null}::timestamptz
      WHERE id = ${input.id}
      RETURNING id
    `;

    return rows.length > 0;
  }

  async listByProviderTransactionId(
    providerTransactionId: string,
  ): Promise<EventDelivery[]> {
    const rows = await this.sql<EventDeliveryRow[]>`
      SELECT *
      FROM event_deliveries
      WHERE provider_transaction_id = ${providerTransactionId}
      ORDER BY created_at ASC
    `;

    return rows.map((row) => this.toEntity(row));
  }

  private serializePayload(payloadJson: unknown): string {
    return typeof payloadJson === "string" ? payloadJson : JSON.stringify(payloadJson);
  }

  private toEntity(row: EventDeliveryRow): EventDelivery {
    return {
      id: row.id,
      providerTransactionId: row.provider_transaction_id,
      eventType: row.event_type,
      url: row.url,
      payloadJson: row.payload_json,
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: toNullableIsoTimestamp(row.next_attempt_at),
      lastError: row.last_error,
      createdAt: toIsoTimestamp(row.created_at),
      sentAt: toNullableIsoTimestamp(row.sent_at),
    };
  }
}
