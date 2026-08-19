export type AppConfig = {
  appEnv: "development" | "production";
  apiHost: string;
  apiPort: number;
  databaseUrl: string;
  internalAllowedIps: string[];
  internalApiKey: string;
  merchantId: string;
  pollingInitialLookbackMs: number;
  pollingMinMs: number;
  pollingMaxMs: number;
  pollingOverlapMs: number;
  webhookDeliveryBatchSize: number;
  webhookDeliveryIntervalMs: number;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function parseAppEnv(): AppConfig["appEnv"] {
  const value = (Bun.env.APP_ENV ?? Bun.env.NODE_ENV ?? "development").trim();
  return value === "production" ? "production" : "development";
}

export function loadConfig(): AppConfig {
  const pollingMinMs = parsePositiveInt(Bun.env.POLLING_MIN_MS, 12_000);
  const pollingMaxMs = parsePositiveInt(Bun.env.POLLING_MAX_MS, 18_000);
  const pollingOverlapMs = parsePositiveInt(Bun.env.POLLING_OVERLAP_MS, 300_000);
  const pollingInitialLookbackMs = parsePositiveInt(
    Bun.env.POLLING_INITIAL_LOOKBACK_MS,
    300_000,
  );
  const webhookDeliveryBatchSize = parsePositiveInt(
    Bun.env.WEBHOOK_DELIVERY_BATCH_SIZE,
    20,
  );
  const webhookDeliveryIntervalMs = parsePositiveInt(
    Bun.env.WEBHOOK_DELIVERY_INTERVAL_MS,
    5_000,
  );
  const appEnv = parseAppEnv();

  return {
    appEnv,
    apiHost: Bun.env.API_HOST?.trim() || "0.0.0.0",
    apiPort: parsePositiveInt(Bun.env.API_PORT, 3000),
    databaseUrl: requiredEnv("DATABASE_URL"),
    internalAllowedIps: parseAllowedIps(appEnv),
    internalApiKey: requiredEnv("INTERNAL_API_KEY"),
    merchantId: requiredEnv("MERCHANT_ID"),
    pollingInitialLookbackMs,
    pollingMinMs: Math.min(pollingMinMs, pollingMaxMs),
    pollingMaxMs: Math.max(pollingMinMs, pollingMaxMs),
    pollingOverlapMs,
    webhookDeliveryBatchSize,
    webhookDeliveryIntervalMs,
  };
}

function parseAllowedIps(appEnv: AppConfig["appEnv"]): string[] {
  const value = Bun.env.INTERNAL_ALLOWED_IPS?.trim();

  if (!value) {
    if (appEnv === "production") {
      throw new Error("Missing required env: INTERNAL_ALLOWED_IPS");
    }

    return ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  }

  return value
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}
