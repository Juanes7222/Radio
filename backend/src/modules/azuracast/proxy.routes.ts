import axios from "axios";
import { Router, type Request, type Response } from "express";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { requireAuth } from "../auth/auth.middleware";
import {
  fetchFromAzuraCast,
  isConnectionError,
  type ProxyRequest,
  type ProxyResult,
} from "./proxy.service";

const router = Router();

function toProxyRequest(req: Request): ProxyRequest {
  return {
    method: req.method,
    headers: req.headers,
    query: req.query,
    body: req.body,
  };
}

async function proxyToAzuraCast(
  req: Request,
  res: Response,
  azuracastPath: string,
  transform?: (data: unknown) => unknown | Promise<unknown>
): Promise<void> {
  try {
    const { status, data } = await fetchFromAzuraCast(toProxyRequest(req), azuracastPath, transform);
    res.status(status).json(data);
  } catch (err) {
    sendProxyError(res, err);
  }
}

/**
 * Maps AzuraCast failures to client responses. Kept as a small HTTP
 * helper so all proxy endpoints share the same error contract.
 */
function sendProxyError(res: Response, err: unknown): void {
  if (isConnectionError(err)) {
    logger.warn("AzuraProxy", "AzuraCast not available, responding 502");
    res.status(502).json({ error: "AzuraCast not available yet" });
    return;
  }

  if (axios.isAxiosError(err) && err.response) {
    res.status(err.response.status).json(err.response.data);
    return;
  }

  logger.error("AzuraProxy", "Proxy error", {
    error: err instanceof Error ? err.message : String(err),
  });
  res.status(502).json({ error: "Error de conexión con AzuraCast" });
}

export { sendProxyError };
export type { ProxyResult };

router.all("/station/*", requireAuth, (req, res) => {
  const path = (req.params as Record<string, string>)[0] ?? "";
  void proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/${path}`);
});

router.get("/nowplaying", requireAuth, (req, res) => {
  void proxyToAzuraCast(req, res, `/api/nowplaying/${config.azuracast.stationId}`);
});

export default router;
