import { Router, type Request, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { requireAuth } from "../auth/auth.middleware";
import { normalizeSearch } from "../../shared/utils/sanitize";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { logger } from "../../shared/logger/logger";

const router = Router();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const STATS_WINDOW_DAYS = 7;

function validatePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

interface DeviceRow {
  deviceId: string;
  fcmToken: string | null;
  platform: string | null;
  appVersion: string | null;
  subscriptions: string | null;
  lastSeen: Date;
  createdAt: Date;
}

// The FCM token is a push credential: expose only whether the device has one.
function toDeviceSummary(device: DeviceRow) {
  return {
    deviceId: device.deviceId,
    hasFcmToken: device.fcmToken !== null,
    platform: device.platform,
    appVersion: device.appVersion,
    subscriptions: parseSubscriptions(device.subscriptions),
    lastSeen: device.lastSeen.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { page, limit, skip } = validatePagination(req.query as Record<string, unknown>);
  const program = typeof req.query.program === "string" ? req.query.program.trim() : "";

  try {
    if (!program) {
      const [rows, total] = await Promise.all([
        prisma.device.findMany({ orderBy: { lastSeen: "desc" }, skip, take: limit }),
        prisma.device.count(),
      ]);
      res.json({
        rows: rows.map(toDeviceSummary),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
      return;
    }

    // The program filter matches normalized titles, which SQLite cannot
    // express as a where clause, so filter in memory before paginating.
    const target = normalizeSearch(program);
    const candidates = await prisma.device.findMany({
      where: { subscriptions: { not: null } },
      orderBy: { lastSeen: "desc" },
    });
    const matching = candidates.filter((device) =>
      parseSubscriptions(device.subscriptions).some(
        (title) => normalizeSearch(title) === target
      )
    );
    const rows = matching.slice(skip, skip + limit);

    res.json({
      rows: rows.map(toDeviceSummary),
      total: matching.length,
      page,
      totalPages: matching.length === 0 ? 0 : Math.ceil(matching.length / limit),
    });
  } catch (err) {
    logger.error("DevicesAdmin", "Error listing devices", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener los dispositivos" });
  }
});

router.get("/notifications-stats", requireAuth, async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - STATS_WINDOW_DAYS * 86400_000);
    const [totalAll, total7d, byProgram] = await Promise.all([
      prisma.programNotification.count(),
      prisma.programNotification.count({ where: { notifiedAt: { gte: since } } }),
      prisma.programNotification.groupBy({
        by: ["programId"],
        where: { notifiedAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { programId: "desc" } },
        take: 10,
      }),
    ]);

    res.json({
      totalAll,
      total7d,
      byProgram: byProgram.map((row) => ({
        programId: row.programId,
        count: row._count._all,
      })),
    });
  } catch (err) {
    logger.error("DevicesAdmin", "Error fetching notification stats", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener las estadísticas de notificaciones" });
  }
});

export default router;
