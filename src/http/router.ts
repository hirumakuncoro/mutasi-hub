import type { Server } from "bun";

import type { AppConfig } from "../config";
import { authorizeInternalRequest } from "./auth";
import { PaymentIntentHandler } from "./paymentIntentHandler";
import { json, notFound } from "./response";

export type RouterDeps = {
  config: AppConfig;
  paymentIntentHandler: PaymentIntentHandler;
};

export async function routeRequest(
  request: Request,
  server: Server<undefined>,
  deps: RouterDeps,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ status: "ok" });
  }

  const authError = authorizeInternalRequest(request, server, deps.config);
  if (authError) return authError;

  if (request.method === "POST" && url.pathname === "/payment-intents") {
    return deps.paymentIntentHandler.create(request);
  }

  return notFound();
}
