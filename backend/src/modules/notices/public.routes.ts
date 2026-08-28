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
      notices: notices.map((n: { id: string; title: string; body: string; imageUrl: string | null; ctaLabel: string | null; ctaUrl: string | null; variant: string; audience: string; startsAt: Date; endsAt: Date; maxDisplaysPerUser: number; dismissible: boolean; createdAt: Date }) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        imageUrl: n.imageUrl,
        ctaLabel: n.ctaLabel,
        ctaUrl: n.ctaUrl,
        variant: n.variant,
        audience: n.audience,
        startsAt: n.startsAt.toISOString(),
        endsAt: n.endsAt.toISOString(),
        maxDisplaysPerUser: n.maxDisplaysPerUser,
        dismissible: n.dismissible,
        createdAt: n.createdAt.toISOString(),
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
