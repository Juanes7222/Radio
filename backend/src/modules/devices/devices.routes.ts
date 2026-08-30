import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { getClientIp, resolveZoneFromIp } from "./geoip.service";

const router = Router();

const MAX_SUBSCRIPTIONS = 100;
const MAX_SUBSCRIPTION_LENGTH = 200;

/**
 * Best-effort zone auto-detection for devices that do not have a manual zone
 * yet. Manual assignments are never overwritten. Runs in the background so the
 * request latency or a geolocation failure never affects registration.
 */
async function assignZoneIfMissing(deviceId: string, ip: string | null): Promise<void> {
  if (!ip) return;
  try {
    const device = await prisma.device.findUnique({
      where: { deviceId },
      select: { zoneId: true },
    });
    if (!device || device.zoneId) return;

    const zone = await resolveZoneFromIp(ip);
    if (!zone) return;

    await prisma.device.update({ where: { deviceId }, data: { zoneId: zone } });
    logger.info("Devices", "Zone auto-assigned", { deviceId, zone });
  } catch (err) {
    logger.warn("Devices", "Zone auto-assign failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function validateSubscriptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;

  const seen = new Set<string>();
  const subscriptions: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_SUBSCRIPTION_LENGTH) return null;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    subscriptions.push(trimmed);
  }

  if (subscriptions.length > MAX_SUBSCRIPTIONS) return null;
  return subscriptions;
}

router.post("/", async (req, res) => {
  const { deviceId, fcmToken, platform, appVersion } = req.body;

  if (!deviceId || typeof deviceId !== "string" || deviceId.trim().length === 0) {
    res.status(400).json({ error: "deviceId es obligatorio" });
    return;
  }

  const trimmedDeviceId = deviceId.trim();

  try {
    const device = await prisma.device.upsert({
      where: { deviceId: trimmedDeviceId },
      create: {
        deviceId: trimmedDeviceId,
        fcmToken: typeof fcmToken === "string" ? fcmToken : null,
        platform: typeof platform === "string" ? platform : null,
        appVersion: typeof appVersion === "string" ? appVersion : null,
      },
      update: {
        fcmToken: typeof fcmToken === "string" ? fcmToken : undefined,
        platform: typeof platform === "string" ? platform : undefined,
        appVersion: typeof appVersion === "string" ? appVersion : undefined,
        lastSeen: new Date(),
      },
    });

    logger.info("Devices", "Registered device", { deviceId: trimmedDeviceId });
    void assignZoneIfMissing(trimmedDeviceId, getClientIp(req));
    res.status(201).json({
      id: device.id,
      deviceId: device.deviceId,
      fcmToken: device.fcmToken,
      platform: device.platform,
      appVersion: device.appVersion,
      lastSeen: device.lastSeen,
    });
  } catch (err) {
    logger.error("Devices", "Error registering device", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al registrar el dispositivo" });
  }
});

router.put("/:deviceId/token", async (req, res) => {
  const { deviceId } = req.params;
  const { fcmToken } = req.body;

  if (!fcmToken || typeof fcmToken !== "string" || fcmToken.trim().length === 0) {
    res.status(400).json({ error: "fcmToken es obligatorio" });
    return;
  }

  if (!deviceId || typeof deviceId !== "string") {
    res.status(400).json({ error: "deviceId es obligatorio" });
    return;
  }

  try {
    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        fcmToken: fcmToken.trim(),
        lastSeen: new Date(),
      },
    });

    logger.info("Devices", "Token updated", { deviceId });
    void assignZoneIfMissing(deviceId, getClientIp(req));
    res.json({
      deviceId: device.deviceId,
      fcmToken: device.fcmToken,
      lastSeen: device.lastSeen,
    });
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "P2025") {
      res.status(404).json({ error: "Dispositivo no encontrado" });
      return;
    }
    logger.error("Devices", "Error updating token", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al actualizar el token" });
  }
});

router.put("/:deviceId/subscriptions", async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId || typeof deviceId !== "string" || deviceId.trim().length === 0) {
    res.status(400).json({ error: "deviceId es obligatorio" });
    return;
  }

  const subscriptions = validateSubscriptions(req.body?.subscriptions);
  if (subscriptions === null) {
    res.status(400).json({ error: "subscriptions debe ser un arreglo de títulos válido" });
    return;
  }

  const trimmedDeviceId = deviceId.trim();

  try {
    const device = await prisma.device.upsert({
      where: { deviceId: trimmedDeviceId },
      create: {
        deviceId: trimmedDeviceId,
        subscriptions: JSON.stringify(subscriptions),
      },
      update: {
        subscriptions: JSON.stringify(subscriptions),
        lastSeen: new Date(),
      },
    });

    logger.info("Devices", "Subscriptions updated", {
      deviceId: trimmedDeviceId,
      count: subscriptions.length,
    });
    void assignZoneIfMissing(trimmedDeviceId, getClientIp(req));
    res.json({
      deviceId: device.deviceId,
      subscriptions,
    });
  } catch (err) {
    logger.error("Devices", "Error updating subscriptions", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al actualizar las suscripciones" });
  }
});

export default router;
