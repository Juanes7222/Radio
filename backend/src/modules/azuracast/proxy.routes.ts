import axios from "axios";
import { Router, type Request, type Response } from "express";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getBogotaDateString } from "../../shared/utils/date";
import { requireAuth } from "../auth/auth.middleware";
import { categorizeSchedule, filterVisibleSchedule } from "../schedule/categorizer.service";
import {
  fetchFromAzuraCast,
  isConnectionError,
  rewriteInternalUrls,
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

function buildPublicUrl(req: Request): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const protocol = (req.headers["x-forwarded-proto"] as string) ?? (req.secure ? "https" : "https");
  return `${protocol}://${host}`;
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
  res.status(502).json({ error: "AzuraCast connection error" });
}

export { sendProxyError };
export type { ProxyResult };

/**
 * Admin schedule needs the same enrichment as the public schedule:
 * default week range, visible-category filtering and category assignment,
 * plus URL rewriting. Without this, `GET /admin-api/station/schedule?now=…`
 * hits AzuraCast with an unsupported `now` param and returns empty.
 */
router.all("/station/schedule", requireAuth, (req, res) => {
  // Allow the frontend to omit start/end — default to the Bogotá week.
  if (!req.query.start || !req.query.end) {
    req.query.start = getBogotaDateString(0);
    req.query.end = getBogotaDateString(6);
  }
  // Drop legacy `now` param that AzuraCast ignores and that would poison the cache key.
  if (req.query.now) delete req.query.now;

  void proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/schedule`, async (d) => {
    const filtered = await filterVisibleSchedule(Array.isArray(d) ? d : []);
    const categorized = await categorizeSchedule(filtered as unknown[]);
    // Rebuild public URL for rewrite (mirrors public.routes buildPublicUrl)
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
    const protocol = req.headers["x-forwarded-proto"] ?? "https";
    const publicUrl = `${protocol}://${host}`;
    return rewriteInternalUrls(categorized, publicUrl);
  });
});

router.all("/station/*", requireAuth, (req, res) => {
  const path = (req.params as Record<string, string>)[0] ?? "";
  const publicUrl = buildPublicUrl(req);
  void proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/${path}`, (data) =>
    rewriteInternalUrls(data, publicUrl)
  );
});

router.get("/nowplaying", requireAuth, (req, res) => {
  const publicUrl = buildPublicUrl(req);
  void proxyToAzuraCast(req, res, `/api/nowplaying/${config.azuracast.stationId}`, (data) =>
    rewriteInternalUrls(data, publicUrl)
  );
});

export default router;
