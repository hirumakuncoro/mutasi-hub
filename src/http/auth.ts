import type { Server } from "bun";

import type { AppConfig } from "../config";
import type { Logger } from "../logger";
import { json } from "./response";

export function authorizeInternalRequest(
  request: Request,
  server: Server<undefined>,
  config: AppConfig,
  logger: Logger,
): Response | null {
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${config.internalApiKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const clientIp = getClientIp(request, server);
  logger.debug("internal request client ip resolved", {
    clientIp,
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
    socketIp: server.requestIP(request)?.address ?? null,
    allowedIps: config.internalAllowedIps,
  });

  if (!clientIp || !config.internalAllowedIps.includes(clientIp)) {
    logger.debug("internal request forbidden by ip allowlist", {
      clientIp,
      allowedIps: config.internalAllowedIps,
    });
    return json({ error: "Forbidden" }, 403);
  }

  return null;
}

function getClientIp(request: Request, server: Server<undefined>): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return normalizeIp(forwardedFor);

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return normalizeIp(realIp);

  const socketAddress = server.requestIP(request);
  return socketAddress?.address ? normalizeIp(socketAddress.address) : null;
}

function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}
