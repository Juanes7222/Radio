import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";

const router = Router();

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

export default router;
