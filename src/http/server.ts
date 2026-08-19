import type { Server } from "bun";

import type { AppConfig } from "../config";
import type { Logger } from "../logger";
import { PaymentIntentRepository } from "../repositories/paymentIntentRepository";
import { PaymentIntentHandler } from "./paymentIntentHandler";
import { json } from "./response";
import { routeRequest } from "./router";

type CreateHttpServerInput = {
  config: AppConfig;
  paymentIntentRepository: PaymentIntentRepository;
  logger: Logger;
};

export function createHttpServer(input: CreateHttpServerInput): Server<undefined> {
  const { config, logger, paymentIntentRepository } = input;
  const paymentIntentHandler = new PaymentIntentHandler(paymentIntentRepository, config);

  const server = Bun.serve({
    hostname: config.apiHost,
    port: config.apiPort,
    fetch(request, server) {
      return routeRequest(request, server, {
        config,
        paymentIntentHandler,
      });
    },
    error(error) {
      logger.error("http server error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: "Internal server error" }, 500);
    },
  });

  logger.info("http server started", {
    host: config.apiHost,
    port: config.apiPort,
  });

  return server;
}
