import { Router, type Request, type Response } from "express";
import { getActiveNotices } from "./notice.service";
import { logger } from "../../shared/logger/logger";

const router = Router();

/**
 * GET /api/notices/active
 * Public, no auth. Returns notices within time window filtered by
 * audience when deviceId / zone / platform are provided.
 * Query: deviceId, zoneId, platform
 */
router.get("/active", async (req: Request, res: Response) => {
  try {
    const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId.trim() : undefined;
    const zoneId = typeof req.query.zoneId === "string" ? req.query.zoneId.trim() : undefined;
    const platform = typeof req.query.platform === "string" ? req.query.platform.trim() : undefined;

    const notices = await getActiveNotices({ deviceId, zoneId, platform });

    res.json({
      notices: notices.map((n) => {
        const gallery = (n as unknown as { galleryItems?: Array<{ id: string; type: string; url: string; posterUrl: string | null; sortOrder: number }> }).galleryItems;
        // Fallback to legacy single media when gallery is empty
        const normalizedGallery =
          gallery && gallery.length > 0
            ? gallery
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((g) => ({
                  id: g.id,
                  type: g.type as "image" | "video",
                  url: g.url,
                  posterUrl: g.posterUrl ?? null,
                }))
            : null;

        return {
          id: (n as unknown as { id: string }).id,
          title: (n as unknown as { title: string }).title,
          body: (n as unknown as { body: string }).body,
          imageUrl: (n as unknown as { imageUrl: string | null }).imageUrl,
          videoUrl: (n as unknown as { videoUrl: string | null }).videoUrl ?? null,
          gallery: normalizedGallery,
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
        };
      }),
    });
  } catch (err) {
    logger.error("NoticesPublic", "Error fetching active notices", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener avisos" });
  }
});

export default router;
