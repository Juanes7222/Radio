import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { PRAYER_STATUS, type PrayerStatus } from "@radio/types";
import { prisma } from "../../infrastructure/database/prisma";
import { config } from "../../config";
import { sendEmail } from "../../infrastructure/email/email.service";
import {
  requireAuth,
  requirePermission,
  resolveAdminSession,
} from "../auth/auth.middleware";
import { hasPermission } from "../auth/permissions";
import { sendPrayerResponseNotification } from "./notification.service";
import {
  broadcastPrayerCreated,
  consumeStreamTicket,
  issueStreamTicket,
  openPrayerStream,
} from "./prayer-stream.service";
import { logger } from "../../shared/logger/logger";
import {
  issueCredential,
  matchesCredential,
  readBearerCredential,
} from "../../shared/utils/credentials";
import { createRateLimiter } from "../../shared/middleware/rate-limit";

const router = Router();

const PRAYER_STATUSES = Object.values(PRAYER_STATUS);
const NAME_MAX_LENGTH = 50;
const REQUEST_MAX_LENGTH = 500;

const createPrayerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: "Demasiadas solicitudes, intenta mas tarde",
});

const readPrayerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  message: "Demasiadas solicitudes, intenta mas tarde",
});

const writePrayerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Demasiadas solicitudes, intenta mas tarde",
});

function isPrayerStatus(value: unknown): value is PrayerStatus {
  return typeof value === "string" && (PRAYER_STATUSES as readonly string[]).includes(value);
}

function emptyStatusCounts(): Record<PrayerStatus, number> {
  return Object.fromEntries(
    PRAYER_STATUSES.map((status) => [status, 0])
  ) as Record<PrayerStatus, number>;
}

function validatePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

const BULK_MAX_IDS = 100;

function parseBulkIds(body: unknown): string[] | null {
  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > BULK_MAX_IDS) return null;
  const normalized: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.trim().length === 0) return null;
    if (!normalized.includes(id)) normalized.push(id);
  }
  return normalized;
}

/**
 * True when the caller presents a fully validated admin session with prayer
 * access. Unlike a bare JWT claim check, a deactivated or revoked admin is not
 * treated as an admin here.
 */
async function isAdminAuthenticated(req: Request): Promise<boolean> {
  const session = await resolveAdminSession(req);
  return session !== null && hasPermission(session.role, session.permissions, "prayer");
}

router.post("/", createPrayerLimiter, async (req: Request, res: Response) => {
  const { name, request, deviceId, consentAccepted } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "El nombre es obligatorio" });
    return;
  }

  if (name.trim().length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `El nombre no puede superar ${NAME_MAX_LENGTH} caracteres` });
    return;
  }

  if (!request || typeof request !== "string" || request.trim().length === 0) {
    res.status(400).json({ error: "La peticion es obligatoria" });
    return;
  }

  if (request.trim().length > REQUEST_MAX_LENGTH) {
    res.status(400).json({ error: `La peticion no puede superar ${REQUEST_MAX_LENGTH} caracteres` });
    return;
  }

  // Consent is part of the submission, not a client-only checkbox: the server
  // records who accepted and which policy version, and refuses to store a
  // prayer without it.
  if (consentAccepted !== true) {
    res.status(400).json({
      error: "Debes aceptar la Politica de Tratamiento de Datos Personales",
    });
    return;
  }

  const trimmedName = name.trim();
  const trimmedRequest = request.trim();
  const trimmedDeviceId = typeof deviceId === "string" ? deviceId.trim() : null;

  try {
    if (trimmedDeviceId) {
      // Ensure the device exists so the foreign key on prayer_requests never fails.
      // The device may not be registered yet when the app runs for the first time
      // because registerDevice() depends on a push token that is not ready yet.
      await prisma.device.upsert({
        where: { deviceId: trimmedDeviceId },
        create: { deviceId: trimmedDeviceId },
        update: { lastSeen: new Date() },
      });
    }

    const credential = issueCredential();

    const entry = await prisma.prayerRequest.create({
      data: {
        name: trimmedName,
        request: trimmedRequest,
        deviceId: trimmedDeviceId,
        estado: "PENDIENTE",
        accessTokenHash: credential.tokenHash,
        consentAcceptedAt: new Date(),
        consentVersion: config.prayer.consentVersion,
      },
    });

    if (config.notifications.prayer.recipients.length > 0) {
      const subject = "Nueva peticion de oracion recibida";
      // The email only points to the authenticated panel. Full-text copies
      // would spread sensitive content across mailboxes, logs and backups.
      const panelUrl = `${config.publicUrl}/admin/prayer`;
      const body = `
        <p>Se recibio una nueva peticion de oracion.</p>
        <p><a href="${panelUrl}">Abrir el panel de peticiones</a></p>
        <p style="font-size: 12px; color: #64748b;">Recibida el ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p>
      `;

      for (const recipient of config.notifications.prayer.recipients) {
        sendEmail(recipient, subject, body).catch((err) => {
          logger.error("PrayerRoutes", "Failed to send prayer email", {
            recipient,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    broadcastPrayerCreated({ id: entry.id, name: entry.name });

    res.status(201).json({
      id: entry.id,
      deviceId: entry.deviceId,
      name: entry.name,
      request: entry.request,
      estado: entry.estado,
      respuesta: entry.respuesta,
      answeredAt: entry.answeredAt,
      readAt: entry.readAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      // Plaintext credential, returned exactly once. The server keeps only its hash.
      accessToken: credential.token,
    });
  } catch (err) {
    logger.error("PrayerRoutes", "Error creating prayer request", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al guardar la peticion" });
  }
});

router.get("/", requireAuth, requirePermission("prayer"), async (req: Request, res: Response) => {
  try {
    const { limit, skip } = validatePagination(req.query as Record<string, unknown>);
    const estado =
      typeof req.query.estado === "string" && isPrayerStatus(req.query.estado.trim())
        ? req.query.estado.trim()
        : null;
    const search =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search.trim()
        : null;

    const where: Prisma.PrayerRequestWhereInput = {};
    if (estado) {
      where.estado = estado;
    }
    if (search) {
      where.OR = [{ name: { contains: search } }, { request: { contains: search } }];
    }

    const [rows, total, grouped, unreadCount] = await Promise.all([
      prisma.prayerRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        omit: { accessTokenHash: true },
      }),
      prisma.prayerRequest.count({ where }),
      prisma.prayerRequest.groupBy({ by: ["estado"], _count: { _all: true } }),
      prisma.prayerRequest.count({ where: { readAt: null } }),
    ]);

    const counts = emptyStatusCounts();
    for (const group of grouped) {
      if (isPrayerStatus(group.estado)) {
        counts[group.estado] = group._count._all;
      }
    }

    res.json({
      rows,
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit),
      counts,
      unreadCount,
    });
  } catch (err) {
    logger.error("PrayerRoutes", "Error fetching prayer requests", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener las peticiones" });
  }
});

// Bulk operations must be registered before "/:id" style routes so that
// "bulk" is never captured as an :id or :deviceId parameter.
router.post("/bulk/read", requireAuth, requirePermission("prayer"), async (req: Request, res: Response) => {
  const ids = parseBulkIds(req.body);
  if (!ids) {
    res.status(400).json({ error: "Lista de ids invalida" });
    return;
  }

  try {
    const result = await prisma.prayerRequest.updateMany({
      where: { id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ count: result.count });
  } catch (err) {
    logger.error("PrayerRoutes", "Error bulk marking prayers as read", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al marcar como leidas" });
  }
});

router.post("/bulk/status", requireAuth, requirePermission("prayer"), async (req: Request, res: Response) => {
  const ids = parseBulkIds(req.body);
  if (!ids) {
    res.status(400).json({ error: "Lista de ids invalida" });
    return;
  }

  const { estado } = req.body as { estado?: unknown };
  if (!isPrayerStatus(estado)) {
    res.status(400).json({ error: "Estado invalido" });
    return;
  }

  try {
    const rows = await prisma.prayerRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, estado: true, answeredAt: true },
    });

    // Mirror the single-update rules: first transition to RESPONDIDA stamps
    // answeredAt; leaving RESPONDIDA clears it.
    const stampIds: string[] = [];
    const clearIds: string[] = [];
    for (const row of rows) {
      if (estado === "RESPONDIDA") {
        if (!row.answeredAt) stampIds.push(row.id);
      } else if (row.estado === "RESPONDIDA" && row.answeredAt) {
        clearIds.push(row.id);
      }
    }

    let count = 0;
    if (stampIds.length > 0) {
      const result = await prisma.prayerRequest.updateMany({
        where: { id: { in: stampIds } },
        data: { estado, answeredAt: new Date() },
      });
      count += result.count;
    }
    if (clearIds.length > 0) {
      const result = await prisma.prayerRequest.updateMany({
        where: { id: { in: clearIds } },
        data: { estado, answeredAt: null },
      });
      count += result.count;
    }

    const adjusted = new Set([...stampIds, ...clearIds]);
    const plainIds = ids.filter((id) => !adjusted.has(id));
    if (plainIds.length > 0) {
      const result = await prisma.prayerRequest.updateMany({
        where: { id: { in: plainIds } },
        data: { estado },
      });
      count += result.count;
    }

    res.json({ count });
  } catch (err) {
    logger.error("PrayerRoutes", "Error bulk updating prayer status", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al actualizar los estados" });
  }
});

router.post("/bulk/delete", requireAuth, requirePermission("prayer"), async (req: Request, res: Response) => {
  const ids = parseBulkIds(req.body);
  if (!ids) {
    res.status(400).json({ error: "Lista de ids invalida" });
    return;
  }

  try {
    const result = await prisma.prayerRequest.deleteMany({
      where: { id: { in: ids } },
    });
    res.json({ count: result.count });
  } catch (err) {
    logger.error("PrayerRoutes", "Error bulk deleting prayers", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al eliminar las peticiones" });
  }
});

// Live feed for the admin panel: a short-lived ticket (issued to an
// authenticated session) authorizes the EventSource connection, since
// EventSource cannot send an Authorization header.
router.post("/events/ticket", requireAuth, requirePermission("prayer"), (_req: Request, res: Response) => {
  res.json(issueStreamTicket());
});

router.get("/stream", (req: Request, res: Response) => {
  const ticket = typeof req.query.ticket === "string" ? req.query.ticket : null;
  if (!consumeStreamTicket(ticket)) {
    res.status(401).json({ error: "Ticket invalido o expirado" });
    return;
  }
  openPrayerStream(req, res);
});

async function findPrayerAccessTokenHash(id: string): Promise<string | null> {
  const row = await prisma.prayerRequest.findUnique({
    where: { id },
    select: { accessTokenHash: true },
  });
  return row?.accessTokenHash ?? null;
}

router.get("/:id", readPrayerLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const entry = await prisma.prayerRequest.findUnique({
      where: { id: String(id) },
      omit: { accessTokenHash: true },
    });

    if (!entry) {
      res.status(404).json({ error: "Peticion no encontrada" });
      return;
    }

    // Admins use their session token; owners use the per-prayer credential.
    // A missing credential is denied: knowing the id is never proof of
    // authorization. Wrong credential and nonexistent id return the same 404
    // so this endpoint is not an existence oracle for sensitive objects.
    if (!(await isAdminAuthenticated(req))) {
      const credential = readBearerCredential(req.headers.authorization);
      if (!credential) {
        res.status(401).json({ error: "Credencial requerida" });
        return;
      }

      const storedHash = await findPrayerAccessTokenHash(String(id));
      if (!matchesCredential(credential, storedHash)) {
        res.status(404).json({ error: "Peticion no encontrada" });
        return;
      }
    }

    res.json(entry);
  } catch (err) {
    logger.error("PrayerRoutes", "Error fetching prayer request", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener la peticion" });
  }
});

router.put("/:id", requireAuth, requirePermission("prayer"), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { estado, respuesta, name, request } = req.body;

  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "ID es obligatorio" });
    return;
  }

  if (estado !== undefined && !isPrayerStatus(estado)) {
    res.status(400).json({ error: "Estado invalido" });
    return;
  }
  if (respuesta !== undefined && typeof respuesta !== "string") {
    res.status(400).json({ error: "La respuesta debe ser texto" });
    return;
  }
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "El nombre no puede quedar vacio" });
    return;
  }
  if (typeof name === "string" && name.trim().length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `El nombre no puede superar ${NAME_MAX_LENGTH} caracteres` });
    return;
  }
  if (request !== undefined && (typeof request !== "string" || request.trim().length === 0)) {
    res.status(400).json({ error: "La peticion no puede quedar vacia" });
    return;
  }
  if (typeof request === "string" && request.trim().length > REQUEST_MAX_LENGTH) {
    res.status(400).json({ error: `La peticion no puede superar ${REQUEST_MAX_LENGTH} caracteres` });
    return;
  }

  try {
    const current = await prisma.prayerRequest.findUnique({
      where: { id },
    });

    if (!current) {
      res.status(404).json({ error: "Peticion no encontrada" });
      return;
    }

    const updateData: Record<string, unknown> = {};
    let nextRespuesta: string | null | undefined;
    if (estado !== undefined) {
      updateData.estado = estado;
      if (estado === "RESPONDIDA" && !current.answeredAt) {
        updateData.answeredAt = new Date();
      }
      if (estado !== "RESPONDIDA" && current.answeredAt) {
        updateData.answeredAt = null;
      }
    }
    if (respuesta !== undefined) {
      const trimmedRespuesta = respuesta.trim();
      nextRespuesta = trimmedRespuesta.length > 0 ? trimmedRespuesta : null;
      updateData.respuesta = nextRespuesta;
    }
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (request !== undefined) {
      updateData.request = request.trim();
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No hay campos para actualizar" });
      return;
    }

    const entry = await prisma.prayerRequest.update({
      where: { id },
      data: updateData,
    });

    // Notify the device only when the response text itself changed, so plain
    // edits to name/request/estado never trigger a duplicate push.
    if (
      nextRespuesta !== undefined &&
      nextRespuesta !== null &&
      nextRespuesta !== current.respuesta &&
      entry.deviceId
    ) {
      const device = await prisma.device.findUnique({
        where: { deviceId: entry.deviceId },
      });

      if (device?.fcmToken) {
        sendPrayerResponseNotification(device.fcmToken, entry.id).catch(
          (err) => {
            logger.error("PrayerRoutes", "Failed to send push notification", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        );
      }
    }

    res.json({
      id: entry.id,
      deviceId: entry.deviceId,
      name: entry.name,
      request: entry.request,
      estado: entry.estado,
      respuesta: entry.respuesta,
      answeredAt: entry.answeredAt,
      readAt: entry.readAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  } catch (err) {
    logger.error("PrayerRoutes", "Error updating prayer request", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al actualizar la peticion" });
  }
});

// Owner deletion. It is authenticated by the per-prayer credential only: the
// id never authorizes anything. Registered before "/:id" to keep the two
// delete routes unambiguous.
router.delete("/:id/own", writePrayerLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const stored = await prisma.prayerRequest.findUnique({
      where: { id: String(id) },
      select: { id: true, accessTokenHash: true },
    });

    if (!stored) {
      res.status(404).json({ error: "Peticion no encontrada" });
      return;
    }

    const credential = readBearerCredential(req.headers.authorization);
    if (!credential) {
      res.status(401).json({ error: "Credencial requerida" });
      return;
    }

    // Wrong credential and nonexistent id share the same 404 so a caller
    // without the credential cannot tell whether the request exists.
    if (!matchesCredential(credential, stored.accessTokenHash)) {
      res.status(404).json({ error: "Peticion no encontrada" });
      return;
    }

    await prisma.prayerRequest.delete({ where: { id: stored.id } });
    res.status(204).end();
  } catch (err) {
    logger.error("PrayerRoutes", "Error deleting own prayer request", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al eliminar la peticion" });
  }
});

// Admin deletion keeps the full session check, including deactivation and
// token-version revocation, since it is destructive.
router.delete("/:id", requireAuth, requirePermission("prayer"), async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.prayerRequest.delete({
      where: { id: String(id) },
    });
    res.status(204).end();
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "P2025") {
      res.status(404).json({ error: "Peticion no encontrada" });
      return;
    }
    logger.error("PrayerRoutes", "Error deleting prayer request", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al eliminar la peticion" });
  }
});

router.post("/:id/read", readPrayerLimiter, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const stored = await prisma.prayerRequest.findUnique({
      where: { id: String(id) },
      select: { id: true, accessTokenHash: true },
    });

    if (!stored) {
      res.status(404).json({ error: "Peticion no encontrada" });
      return;
    }

    // Same policy as the detail endpoint: admins use their session token,
    // owners use the per-prayer credential, and a missing credential is 401.
    if (!(await isAdminAuthenticated(req))) {
      const credential = readBearerCredential(req.headers.authorization);
      if (!credential) {
        res.status(401).json({ error: "Credencial requerida" });
        return;
      }
      if (!matchesCredential(credential, stored.accessTokenHash)) {
        res.status(404).json({ error: "Peticion no encontrada" });
        return;
      }
    }

    await prisma.prayerRequest.update({
      where: { id: stored.id },
      data: { readAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error("PrayerRoutes", "Error marking prayer as read", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al marcar como leida" });
  }
});

export default router;
