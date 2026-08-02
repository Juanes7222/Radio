import axios from "axios";
import { Router, type Request, type Response } from "express";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getBogotaDateString } from "../../shared/utils/date";
import { normalizeSearch } from "../../shared/utils/sanitize";
import { SEARCH_DEFAULT_PAGE_SIZE, SEARCH_MAX_PAGE_SIZE } from "../../shared/constants";
import {
  categorizeSchedule,
  categoryToSummary,
  filterVisibleSchedule,
  getVisibleCategories,
} from "../schedule/categorizer.service";
import {
  fetchFromAzuraCast,
  getAllRequestableSongs,
  isConnectionError,
  rewriteInternalUrls,
  searchRequestableSongs,
  type ProxyRequest,
} from "./proxy.service";
import { sendProxyError } from "./proxy.routes";

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
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "";
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  return `${protocol}://${host}`;
}

router.get("/nowplaying", async (req, res) => {
  const publicUrl = buildPublicUrl(req);
  try {
    const { status, data } = await fetchFromAzuraCast(
      toProxyRequest(req),
      `/api/nowplaying/${config.azuracast.stationId}`,
      (d) => rewriteInternalUrls(d, publicUrl)
    );
    if (status === 404) {
      return res.status(200).json({
        station: null,
        listeners: { total: 0, unique: 0, current: 0 },
        live: { is_live: false, streamer_name: null, broadcast_start: null, art: null },
        now_playing: null,
        playing_next: null,
        song_history: [],
      });
    }
    res.status(status).json(data);
  } catch (err) {
    sendProxyError(res, err);
  }
});

router.get("/search", async (req, res) => {
  const publicUrl = buildPublicUrl(req);

  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = Math.min(
      SEARCH_MAX_PAGE_SIZE,
      Math.max(1, Number(req.query.per_page ?? SEARCH_DEFAULT_PAGE_SIZE))
    );
    const search = normalizeSearch(String(req.query.search ?? ""));

    const allSongs = await getAllRequestableSongs(toProxyRequest(req), publicUrl);
    const result = searchRequestableSongs(allSongs, search, page, perPage);

    res.status(200).json(result);
  } catch (err) {
    if (isConnectionError(err)) {
      return res.status(502).json({ error: "AzuraCast not available yet" });
    }
    if (axios.isAxiosError(err) && err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    logger.error("AzuraProxy", "Search error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(502).json({ error: "Error de conexión con AzuraCast" });
  }
});

router.get("/schedule", async (req, res) => {
  const publicUrl = buildPublicUrl(req);

  if (!req.query.start || !req.query.end) {
    req.query.start = getBogotaDateString(0);
    req.query.end = getBogotaDateString(6);
  }

  try {
    const { status, data } = await fetchFromAzuraCast(
      toProxyRequest(req),
      `/api/station/${config.azuracast.stationId}/schedule`,
      async (d) => {
        const filtered = await filterVisibleSchedule(Array.isArray(d) ? d : []);
        const categorized = await categorizeSchedule(filtered as unknown[]);
        return rewriteInternalUrls(categorized, publicUrl);
      }
    );
    res.status(status).json(data);
  } catch (err) {
    sendProxyError(res, err);
  }
});

router.get("/schedule/categories", async (_req, res) => {
  try {
    const categories = await getVisibleCategories();
    res.status(200).json(categories.map(categoryToSummary));
  } catch (err) {
    logger.error("ScheduleCategories", "Error fetching schedule categories", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener las categorías de programación" });
  }
});

router.get("/station/:stationId/art/:artId", async (req, res) => {
  const { stationId, artId } = req.params;
  try {
    const azuraCastResponse = await axios({
      method: "GET",
      url: `${config.azuracast.url}/api/station/${stationId}/art/${artId}`,
      headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
      responseType: "stream",
      timeout: 15_000,
    });
    const contentType = azuraCastResponse.headers["content-type"];
    res.setHeader("Content-Type", typeof contentType === "string" ? contentType : "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    azuraCastResponse.data.pipe(res);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).send();
    } else {
      res.status(502).send();
    }
  }
});

router.post("/requests/:songId", (req, res) => {
  const { songId } = req.params;
  const publicUrl = buildPublicUrl(req);
  void sendProxyRequestWithRewrite(req, res, `/api/station/${config.azuracast.stationId}/request/${songId}`, publicUrl);
});

router.post("/station/nowplaying/update", (req, res) => {
  const secret = req.headers["x-webhook-secret"] ?? "";
  if (!secret || secret !== config.webhook.secret) {
    return res.status(403).json({ error: "Invalid Webhook secret" });
  }
  const publicUrl = buildPublicUrl(req);
  void sendProxyRequestWithRewrite(req, res, `/api/station/${config.azuracast.stationId}/nowplaying/update`, publicUrl);
});

async function sendProxyRequestWithRewrite(req: Request, res: Response, path: string, publicUrl: string): Promise<void> {
  try {
    const { status, data } = await fetchFromAzuraCast(
      toProxyRequest(req),
      path,
      (d) => rewriteInternalUrls(d, publicUrl)
    );
    res.status(status).json(data);
  } catch (err) {
    sendProxyError(res, err);
  }
}

export default router;
