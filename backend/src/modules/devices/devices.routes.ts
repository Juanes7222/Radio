import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { getClientIp, getTrustedProxyCity, resolveZoneDetails } from "./geoip.service";

const router = Router();

const MAX_SUBSCRIPTIONS = 100;
const MAX_SUBSCRIPTION_LENGTH = 200;

/**
 * Persists the public IP observed for this device so the admin panel can
 * bulk-recalculate zones later without requiring a new request from each device.
 * Runs in background and never blocks the response.
 */
async function persistLastIp(deviceId: string, ip: string | null): Promise<void> {
  if (!ip) return;
  try {
    await prisma.device.update({
      where: { deviceId },
      data: { lastIp: ip, lastIpAt: new Date() },
    });
  } catch {
    // best-effort, ignore if device race condition
  }
}

/**
 * Best-effort zone auto-detection for devices that do not have a zone yet.
 * - Never overwrites an existing zoneId (MANUAL or previous AUTO).
 * - Distinguishes source so the admin can audit how the zone was assigned.
 * - Runs in background so request latency or a geolocation failure never
 *   affects registration.
 */
async function assignZoneIfMissing(deviceId: string, ip: string | null, proxyCity: string | null): Promise<void> {
  // Allow proxy city even when IP is missing, otherwise require a public IP.
  if (!ip && !proxyCity) return;
  try {
    const device = await prisma.device.findUnique({
      where: { deviceId },
      select: { zoneId: true },
    });
    if (!device || device.zoneId) return;

    // Trusted proxy header has priority over IP lookup (only when
    // GEOIP_TRUST_PROXY_HEADERS=true, otherwise proxyCity is null).
    if (proxyCity) {
      await prisma.device.update({
        where: { deviceId },
        data: {
          zoneId: proxyCity,
          zoneSource: "CF",
          zoneAssignedAt: new Date(),
          zoneRegion: null,
          zoneCountry: null,
        },
      });
      logger.info("Devices", "Zone auto-assigned via trusted proxy", { deviceId, zone: proxyCity, source: "CF" });
      return;
    }

    if (!ip) return;
    const result = await resolveZoneDetails(ip);
    if (!result) return;

    await prisma.device.update({
      where: { deviceId },
      data: {
        zoneId: result.city,
        zoneSource: result.source,
        zoneAssignedAt: new Date(),
        zoneRegion: result.region,
        zoneCountry: result.country,
      },
    });
    logger.info("Devices", "Zone auto-assigned", { deviceId, zone: result.city, source: result.source });
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
  const clientIp = getClientIp(req);
  const proxyCity = getTrustedProxyCity(req);

  try {
    const device = await prisma.device.upsert({
      where: { deviceId: trimmedDeviceId },
      create: {
        deviceId: trimmedDeviceId,
        fcmToken: typeof fcmToken === "string" ? fcmToken : null,
        platform: typeof platform === "string" ? platform : null,
        appVersion: typeof appVersion === "string" ? appVersion : null,
        lastIp: clientIp,
        lastIpAt: clientIp ? new Date() : null,
      },
      update: {
        fcmToken: typeof fcmToken === "string" ? fcmToken : undefined,
        platform: typeof platform === "string" ? platform : undefined,
        appVersion: typeof appVersion === "string" ? appVersion : undefined,
        lastSeen: new Date(),
        ...(clientIp ? { lastIp: clientIp, lastIpAt: new Date() } : {}),
      },
    });

    logger.info("Devices", "Registered device", { deviceId: trimmedDeviceId });
    void assignZoneIfMissing(trimmedDeviceId, clientIp, proxyCity);
    // Ensure IP is persisted even when assignZoneIfMissing skips due to existing zone
    if (clientIp) void persistLastIp(trimmedDeviceId, clientIp);
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

  const clientIp = getClientIp(req);
  try {
    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        fcmToken: fcmToken.trim(),
        lastSeen: new Date(),
        ...(clientIp ? { lastIp: clientIp, lastIpAt: new Date() } : {}),
      },
    });

    logger.info("Devices", "Token updated", { deviceId });
    void assignZoneIfMissing(deviceId, clientIp, getTrustedProxyCity(req));
    if (clientIp) void persistLastIp(deviceId, clientIp);
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
  const clientIp = getClientIp(req);

  try {
    const device = await prisma.device.upsert({
      where: { deviceId: trimmedDeviceId },
      create: {
        deviceId: trimmedDeviceId,
        subscriptions: JSON.stringify(subscriptions),
        lastIp: clientIp,
        lastIpAt: clientIp ? new Date() : null,
      },
      update: {
        subscriptions: JSON.stringify(subscriptions),
        lastSeen: new Date(),
        ...(clientIp ? { lastIp: clientIp, lastIpAt: new Date() } : {}),
      },
    });

    logger.info("Devices", "Subscriptions updated", {
      deviceId: trimmedDeviceId,
      count: subscriptions.length,
    });
    void assignZoneIfMissing(trimmedDeviceId, clientIp, getTrustedProxyCity(req));
    if (clientIp) void persistLastIp(trimmedDeviceId, clientIp);
    res.json({
      deviceId: device.deviceId,
      subscriptions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("Devices", "Error updating subscriptions", { error: msg, stack, deviceId: trimmedDeviceId });

    if (msg.includes("no such column") || msg.includes("Unknown arg") || msg.includes("subscriptions")) {
      logger.error("Devices", "Possible Migrations pending", { error: msg });
    }
    res.status(500).json({ error: "Error updating subscriptions", details: msg });
  }
});

export default router;
