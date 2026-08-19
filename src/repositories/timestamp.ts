export type DbTimestamp = Date | string;

export function toIsoTimestamp(value: DbTimestamp): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toNullableIsoTimestamp(value: DbTimestamp | null): string | null {
  return value === null ? null : toIsoTimestamp(value);
}
