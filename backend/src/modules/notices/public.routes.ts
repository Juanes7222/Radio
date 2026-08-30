import { Router, type Request, type Response } from "express";
import { getActiveNotices } from "./notice.service";
import { logger } from "../../shared/logger/logger";

const router = Router();

/**
 * GET /api/notices/active
 * Publico, sin auth. Devuelve avisos dentro de ventana temporal filtrados por
 * audiencia si se provee deviceId / zone / platform.
 * Query: deviceId, zoneId, platform
 */
router.get("/active", async (req: Request, res: Response) => {
  try {
    const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId.trim() : undefined;
    const zoneId = typeof req.query.zoneId === "string" ? req.query.zoneId.trim() : undefined;
    const platform = typeof req.query.platform === "string" ? req.query.platform.trim() : undefined;

    const notices = await getActiveNotices({ deviceId, zoneId, platform });

    res.json({
      notices: notices.map((n) => ({
        id: (n as unknown as { id: string }).id,
        title: (n as unknown as { title: string }).title,
        body: (n as unknown as { body: string }).body,
        imageUrl: (n as unknown as { imageUrl: string | null }).imageUrl,
        videoUrl: (n as unknown as { videoUrl: string | null }).videoUrl ?? null,
        ctaLabel: (n as unknown as { ctaLabel: string | null }).ctaLabel,
        ctaUrl: (n as unknown as { ctaUrl: string | null }).ctaUrl,
        variant: (n as unknown as { variant: string }).variant,
        audience: (n as unknown as { audience: string }).audience,
        displayMode: (n as unknown as { displayMode?: string }).displayMode ?? "toast",
        startsAt: (n as unknown as { startsAt: Date }).startsAt.toISOString(),
        endsAt: (n as unknown as { endsAt: Date }).endsAt.toISOString(),
        maxDisplaysPerUser: (n as unknown as { maxDisplaysPerUser: number }).maxDisplaysPerUser,
        dismissible: (n as unknown as { dismissible: boolean }).dismissible,
        createdAt: (n as unknown as { createdAt: Date }).createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error("NoticesPublic", "Error fetching active notices", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener avisos" });
  }
});

export default router;
