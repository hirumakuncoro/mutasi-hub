import { Logger } from "./logger";
import { loadConfig } from "./config";
import { PollingWorker } from "./worker";
import { DatabaseClient } from "./database";
import { createHttpServer } from "./http/server";
import { WebhookDeliveryWorker } from "./webhookDeliveryWorker";
import { GoBizSessionService } from "./services/gobizSessionService";
import { GoBizTransactionClient } from "./services/gobizTransactionClient";
import { PaymentMatchingService } from "./services/paymentMatchingService";
import { PaymentIntentRepository } from "./repositories/paymentIntentRepository";
import { EventDeliveryRepository } from "./repositories/eventDeliveryRepository";
import { MerchantSessionRepository } from "./repositories/merchantSessionRepository";
import { ProviderTransactionRepository } from "./repositories/providerTransactionRepository";
import { MerchantPollingStateRepository } from "./repositories/merchantPollingStateRepository";

const config = loadConfig();
const logger = new Logger("app", { env: config.appEnv });
const database = new DatabaseClient(config.databaseUrl, logger.child("database"));

const providerTransactionRepository = new ProviderTransactionRepository(database.connection());
const pollingStateRepository = new MerchantPollingStateRepository(database.connection());
const merchantSessionRepository = new MerchantSessionRepository(database.connection());
const paymentIntentRepository = new PaymentIntentRepository(database.connection());
const eventDeliveryRepository = new EventDeliveryRepository(database.connection());
const gobizSessionService = new GoBizSessionService(merchantSessionRepository);
const gobizTransactionClient = new GoBizTransactionClient();
const paymentMatchingService = new PaymentMatchingService(
  providerTransactionRepository,
  paymentIntentRepository,
  eventDeliveryRepository,
);

const worker = new PollingWorker(
  config,
  logger.child("worker"),
  pollingStateRepository,
  gobizSessionService,
  gobizTransactionClient,
  paymentMatchingService,
);
const webhookDeliveryWorker = new WebhookDeliveryWorker(
  config,
  logger.child("webhook"),
  eventDeliveryRepository,
);

await database.migrate();
const httpServer = createHttpServer({
  config,
  paymentIntentRepository,
  logger: logger.child("http"),
});
worker.start();
webhookDeliveryWorker.start();

async function shutdown(signal: string): Promise<void> {
  logger.info("shutdown requested", { signal });
  worker.stop();
  webhookDeliveryWorker.stop();
  await httpServer.stop(true);
  await database.close();
  process.exit(0);
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));
