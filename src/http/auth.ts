import type { Server } from "bun";

import type { AppConfig } from "../config";
import { json } from "./response";

export function authorizeInternalRequest(
  request: Request,
  server: Server<undefined>,
  config: AppConfig,
): Response | null {
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${config.internalApiKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const clientIp = getClientIp(request, server);
  if (!clientIp || !config.internalAllowedIps.includes(clientIp)) {
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
