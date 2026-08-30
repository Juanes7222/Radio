import { Router, type Request, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { requireAuth } from "../auth/auth.middleware";
import { normalizeSearch } from "../../shared/utils/sanitize";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { logger } from "../../shared/logger/logger";
import {
  previewPushCampaign,
  sendPushCampaign,
  type PushAudience,
  type PushCampaignInput,
} from "./push.service";

const router = Router();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const STATS_WINDOW_DAYS = 7;
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 500;
const MAX_DEVICE_IDS = 500;

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
  zoneId: string | null;
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
    zoneId: device.zoneId,
    lastSeen: device.lastSeen.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { page, limit, skip } = validatePagination(req.query as Record<string, unknown>);
  const program = typeof req.query.program === "string" ? req.query.program.trim() : "";
  const zone = typeof req.query.zone === "string" ? req.query.zone.trim() : "";

  try {
    if (!program && !zone) {
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
      where: { subscriptions: { not: null }, zoneId: zone ? zone : undefined },
      orderBy: { lastSeen: "desc" },
    });
    const matching = candidates.filter(
      (device) =>
        !target ||
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

function validatePushCampaignInput(body: unknown): { ok: true; input: PushCampaignInput } | { ok: false; error: string } {
  const record = (body ?? {}) as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: "El título es obligatorio (máx. 100 caracteres)" };
  }

  const messageBody = typeof record.body === "string" ? record.body.trim() : "";
  if (!messageBody || messageBody.length > MAX_BODY_LENGTH) {
    return { ok: false, error: "El mensaje es obligatorio (máx. 500 caracteres)" };
  }

  const audience = record.audience as PushAudience;
  const validAudiences: PushAudience[] = ["all", "devices", "zone", "platform", "program", "active"];
  if (!validAudiences.includes(audience)) {
    return { ok: false, error: "Audiencia inválida" };
  }

  let deviceIds: string[] | undefined;
  if (audience === "devices") {
    if (!Array.isArray(record.deviceIds) || record.deviceIds.length === 0) {
      return { ok: false, error: "Debes seleccionar al menos un dispositivo" };
    }
    if (record.deviceIds.length > MAX_DEVICE_IDS) {
      return { ok: false, error: `Máximo ${MAX_DEVICE_IDS} dispositivos por envío` };
    }
    deviceIds = record.deviceIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (deviceIds.length === 0) {
      return { ok: false, error: "Debes seleccionar al menos un dispositivo" };
    }
  }

  const zoneId =
    audience === "zone" && typeof record.zoneId === "string"
      ? record.zoneId.trim()
      : undefined;
  if (audience === "zone" && !zoneId) {
    return { ok: false, error: "Debes indicar la zona" };
  }

  const platform =
    audience === "platform" && typeof record.platform === "string"
      ? record.platform.trim()
      : undefined;
  if (audience === "platform" && !platform) {
    return { ok: false, error: "Debes indicar la plataforma" };
  }

  const program =
    audience === "program" && typeof record.program === "string"
      ? record.program.trim()
      : undefined;
  if (audience === "program" && !program) {
    return { ok: false, error: "Debes indicar el programa" };
  }

  const activeDays =
    audience === "active"
      ? Math.min(365, Math.max(1, Number(record.activeDays) || 7))
      : undefined;

  return {
    ok: true,
    input: {
      title,
      body: messageBody,
      audience,
      deviceIds,
      zoneId,
      platform,
      program,
      activeDays,
    },
  };
}

router.get("/zones", requireAuth, async (_req: Request, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
      where: { zoneId: { not: null } },
      select: { zoneId: true },
    });
    const zones = [...new Set(
      devices
        .map((device) => device.zoneId)
        .filter((zone): zone is string => Boolean(zone))
    )].sort((a, b) => a.localeCompare(b, "es"));
    res.json({ zones });
  } catch (err) {
    logger.error("DevicesAdmin", "Error listing zones", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener las zonas" });
  }
});

router.put("/:deviceId/zone", requireAuth, async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  if (!deviceId || typeof deviceId !== "string") {
    res.status(400).json({ error: "deviceId es obligatorio" });
    return;
  }
  const rawZone = (req.body as Record<string, unknown>)?.zoneId;
  const zoneId =
    typeof rawZone === "string" && rawZone.trim().length > 0 ? rawZone.trim() : null;

  try {
    const device = await prisma.device.update({
      where: { deviceId },
      data: { zoneId },
    });
    res.json({ deviceId: device.deviceId, zoneId: device.zoneId });
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "P2025") {
      res.status(404).json({ error: "Dispositivo no encontrado" });
      return;
    }
    logger.error("DevicesAdmin", "Error assigning zone", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al asignar la zona" });
  }
});

router.post("/send-notification", requireAuth, async (req: Request, res: Response) => {
  const validation = validatePushCampaignInput(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const result = await sendPushCampaign(validation.input);

    await prisma.pushNotificationLog.create({
      data: {
        title: validation.input.title,
        body: validation.input.body,
        audience: validation.input.audience,
        filters: JSON.stringify({
          deviceIds: validation.input.deviceIds,
          zoneId: validation.input.zoneId,
          platform: validation.input.platform,
          program: validation.input.program,
          activeDays: validation.input.activeDays,
        }),
        targetedCount: result.targeted,
        sentCount: result.sent,
        failedCount: result.failed,
        invalidTokens: result.invalidTokens,
      },
    });

    res.json(result);
  } catch (err) {
    logger.error("DevicesAdmin", "Error sending push notification", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al enviar la notificación" });
  }
});

router.post("/preview-notification", requireAuth, async (req: Request, res: Response) => {
  const validation = validatePushCampaignInput(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const result = await previewPushCampaign(validation.input);
    res.json(result);
  } catch (err) {
    logger.error("DevicesAdmin", "Error previewing push notification", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al previsualizar la notificación" });
  }
});

router.get("/notification-logs", requireAuth, async (req: Request, res: Response) => {
  const { page, limit, skip } = validatePagination(req.query as Record<string, unknown>);

  try {
    const [rows, total] = await Promise.all([
      prisma.pushNotificationLog.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.pushNotificationLog.count(),
    ]);

    res.json({
      rows: rows.map((log) => ({
        id: log.id,
        title: log.title,
        body: log.body,
        audience: log.audience,
        filters: log.filters ? JSON.parse(log.filters) : null,
        targetedCount: log.targetedCount,
        sentCount: log.sentCount,
        failedCount: log.failedCount,
        invalidTokens: log.invalidTokens,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error("DevicesAdmin", "Error fetching push notification logs", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener el historial de notificaciones" });
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
