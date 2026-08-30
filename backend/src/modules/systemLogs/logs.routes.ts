import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getLogSources, getLogs, getLogsTail } from "./logs.service";
import { logger } from "../../shared/logger/logger";

const router = Router();

// All log endpoints require admin auth
router.use(requireAuth);

const VALID_SOURCES = new Set(["server", "azuracast", "nginx", "postgres", "worker", "locutor", "all"]);
const VALID_LEVELS = new Set(["all", "debug", "info", "warn", "error", "fatal"]);
const VALID_ORDERS = new Set(["asc", "desc"]);

function parseLimit(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 1), 500);
}

/**
 * GET /admin-api/logs/sources
 * Returns health/counts per source for the patchbay.
 */
router.get("/sources", async (_req: Request, res: Response) => {
  try {
    const data = await getLogSources();
    res.json(data);
  } catch (err) {
    logger.error("LogsRoutes", "getLogSources failed", { error: String(err) });
    res.status(500).json({ error: "No se pudieron obtener las fuentes de logs" });
  }
});

/**
 * GET /admin-api/logs
 * Query: source, level, search, limit, cursor, order
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const source = String(req.query.source ?? "all");
    const level = String(req.query.level ?? "all");
    const search = req.query.search ? String(req.query.search) : undefined;
    const order = String(req.query.order ?? "desc");
    const limit = parseLimit(req.query.limit, 160);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    if (!VALID_SOURCES.has(source)) {
      res.status(400).json({ error: `source inválido: ${source}` });
      return;
    }
    if (!VALID_LEVELS.has(level)) {
      res.status(400).json({ error: `level inválido: ${level}` });
      return;
    }
    if (!VALID_ORDERS.has(order)) {
      res.status(400).json({ error: `order inválido: ${order}` });
      return;
    }
    if (search && search.length > 200) {
      res.status(400).json({ error: "search demasiado largo (max 200)" });
      return;
    }

    const data = await getLogs({ source, level, search, limit, cursor, order });
    res.json(data);
  } catch (err) {
    logger.error("LogsRoutes", "getLogs failed", { error: String(err) });
    res.status(500).json({ error: "No se pudieron cargar los logs" });
  }
});

/**
 * GET /admin-api/logs/tail
 * Query: source, since (ISO), limit
 * Polling fallback for "all" and for SSE reconnection.
 */
router.get("/tail", async (req: Request, res: Response) => {
  try {
    const source = String(req.query.source ?? "all");
    const since = req.query.since ? String(req.query.since) : undefined;
    const limit = parseLimit(req.query.limit, 80);

    if (!VALID_SOURCES.has(source)) {
      res.status(400).json({ error: `source inválido: ${source}` });
      return;
    }
    if (since && Number.isNaN(new Date(since).getTime())) {
      res.status(400).json({ error: "since inválido (ISO requerido)" });
      return;
    }

    const data = await getLogsTail({ source, since, limit });
    res.json(data);
  } catch (err) {
    logger.error("LogsRoutes", "getLogsTail failed", { error: String(err) });
    res.status(500).json({ error: "No se pudo obtener el tail" });
  }
});

/**
 * GET /admin-api/logs/stream
 * SSE live tail for a concrete source. Front uses fetch+ReadableStream with Authorization header.
 * Query: source (required, not "all"), since (ISO), tail (number)
 */
router.get("/stream", async (req: Request, res: Response) => {
  const source = String(req.query.source ?? "");
  const sinceRaw = req.query.since ? String(req.query.since) : new Date(Date.now() - 5 * 60_000).toISOString();
  const tail = parseLimit(req.query.tail, 60);

  if (!source || !VALID_SOURCES.has(source)) {
    res.status(400).json({ error: `source inválido: ${source}` });
    return;
  }
  if (source === "all") {
    res.status(400).json({ error: 'SSE no soporta source=all, usa polling /tail' });
    return;
  }
  if (Number.isNaN(new Date(sinceRaw).getTime())) {
    res.status(400).json({ error: "since inválido" });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Flush headers immediately
  res.flushHeaders?.();

  let alive = true;
  let lastTs = sinceRaw;
  let pollTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const cleanup = () => {
    alive = false;
    if (pollTimer) clearInterval(pollTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  };

  req.on("close", cleanup);
  res.on("close", cleanup);

  const sendRow = (row: { ts: string; level: string; source: string; msg: string }) => {
    if (!alive) return;
    try {
      const payload = JSON.stringify({ ts: row.ts, level: row.level, source: row.source, msg: row.msg });
      res.write(`data: ${payload}\n\n`);
      lastTs = row.ts;
    } catch {}
  };

  // Heartbeat to keep proxy from buffering
  heartbeatTimer = setInterval(() => {
    if (!alive) return;
    try {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    } catch {
      cleanup();
    }
  }, 15_000);

  // Polling loop: every 2500ms fetch new rows for source
  const tick = async () => {
    if (!alive) return;
    try {
      const data = await getLogsTail({ source, since: lastTs, limit: 80 });
      // tail returns newest-first; reverse to send oldest-first in order
      const ordered = [...data.rows].reverse();
      for (const r of ordered) {
        const t = new Date(r.ts).getTime();
        const last = new Date(lastTs).getTime();
        if (t > last) sendRow(r);
      }
      // If no new rows, do not update lastTs; keep as is
    } catch (err) {
      logger.warn("LogsRoutes", "stream tick failed", { source, error: String(err) });
    }
  };

  // Initial tick immediately
  await tick();

  pollTimer = setInterval(() => {
    void tick();
  }, 2500);

  // Also send initial comment
  res.write(`:connected source=${source} since=${lastTs}\n\n`);
});

export default router;
