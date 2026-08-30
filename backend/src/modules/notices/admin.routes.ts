import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { logger } from "../../shared/logger/logger";
import { previewPushCampaign } from "../devices/push.service";

const router = Router();

// Prisma is accessed via any to avoid stale generated client type issues during dev
function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("../../infrastructure/database/prisma") as { prisma: any };
  return prisma as any;
}

const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_GALLERY_ITEMS = 10;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validate(input: Record<string, unknown>): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > MAX_TITLE) return { ok: false, error: `Título requerido (máx ${MAX_TITLE})` };
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body || body.length > MAX_BODY) return { ok: false, error: `Cuerpo requerido (máx ${MAX_BODY})` };
  const startsAt = parseDate(input.startsAt);
  const endsAt = parseDate(input.endsAt);
  if (!startsAt || !endsAt) return { ok: false, error: "Fechas inválidas" };
  if (endsAt <= startsAt) return { ok: false, error: "endsAt debe ser posterior a startsAt" };
  const validAudiences = ["all", "zone", "platform", "program", "devices"];
  if (!validAudiences.includes(String(input.audience))) return { ok: false, error: "Audiencia inválida" };
  return { ok: true, data: { title, body, startsAt, endsAt } };
}

/**
 * Normalizes and validates gallery input.
 * Expected shape: Array<{ type: 'image'|'video', url: string, posterUrl?: string }>
 */
function parseGallery(input: unknown): Array<{ type: string; url: string; posterUrl: string | null }> | null {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) return null;
  if (input.length === 0) return [];
  if (input.length > MAX_GALLERY_ITEMS) throw new Error(`Máximo ${MAX_GALLERY_ITEMS} elementos en el carrusel`);
  const normalized: Array<{ type: string; url: string; posterUrl: string | null }> = [];
  for (const item of input as Array<Record<string, unknown>>) {
    const type = String(item.type ?? "").trim();
    if (type !== "image" && type !== "video") throw new Error("Tipo de galería inválido");
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url) throw new Error("URL de galería requerida");
    const posterUrl = typeof item.posterUrl === "string" && item.posterUrl.trim() ? item.posterUrl.trim() : null;
    normalized.push({ type, url, posterUrl });
  }
  return normalized;
}

function mapNoticeWithGallery(row: any) {
  return {
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    gallery: (row.galleryItems ?? [])
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      .map((g: any) => ({
        id: g.id,
        type: g.type,
        url: g.url,
        posterUrl: g.posterUrl ?? null,
        sortOrder: g.sortOrder,
      })),
  };
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.appNotice.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { galleryItems: { orderBy: { sortOrder: "asc" } } },
      }),
      prisma.appNotice.count(),
    ]);
    res.json({
      rows: rows.map((r: any) => mapNoticeWithGallery(r)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error("NoticesAdmin", "list failed", { error: String(err) });
    res.status(500).json({ error: "Error al listar avisos" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const v = validate(body);
  if (!v.ok) {
    res.status(400).json({ error: v.error });
    return;
  }
  let gallery: ReturnType<typeof parseGallery> = null;
  try {
    gallery = parseGallery(body.gallery);
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Galería inválida" });
    return;
  }
  try {
    const audience = String(body.audience ?? "all");
    const displayMode = body.displayMode === "modal" ? "modal" : "toast";
    const notice = await prisma.appNotice.create({
      data: {
        title: v.data.title,
        body: v.data.body,
        imageUrl: typeof body.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim() : null,
        videoUrl: typeof body.videoUrl === "string" && body.videoUrl.trim() ? body.videoUrl.trim() : null,
        ctaLabel: typeof body.ctaLabel === "string" && body.ctaLabel.trim() ? body.ctaLabel.trim() : null,
        ctaUrl: typeof body.ctaUrl === "string" && body.ctaUrl.trim() ? body.ctaUrl.trim() : null,
        variant: typeof body.variant === "string" ? body.variant : "info",
        audience,
        audienceZoneId: audience === "zone" && typeof body.audienceZoneId === "string" ? body.audienceZoneId.trim() : null,
        audiencePlatform: audience === "platform" && typeof body.audiencePlatform === "string" ? body.audiencePlatform.trim() : null,
        audienceProgram: audience === "program" && typeof body.audienceProgram === "string" ? body.audienceProgram.trim() : null,
        audienceDeviceIds: audience === "devices" && Array.isArray(body.audienceDeviceIds) ? JSON.stringify(body.audienceDeviceIds) : null,
        displayMode,
        startsAt: v.data.startsAt,
        endsAt: v.data.endsAt,
        maxDisplaysPerUser: Math.max(0, Math.min(100, Number(body.maxDisplaysPerUser) || 3)),
        dismissible: body.dismissible !== false,
        isActive: body.isActive !== false,
        ...(gallery
          ? {
              galleryItems: {
                create: gallery.map((g, idx) => ({
                  type: g.type,
                  url: g.url,
                  posterUrl: g.posterUrl,
                  sortOrder: idx,
                })),
              },
            }
          : {}),
      },
      include: { galleryItems: { orderBy: { sortOrder: "asc" } } },
    });
    res.status(201).json(mapNoticeWithGallery(notice));
  } catch (err) {
    logger.error("NoticesAdmin", "create failed", { error: String(err) });
    res.status(500).json({ error: "Error al crear aviso" });
  }
});

router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const { id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const v = validate(body);
  if (!v.ok) {
    res.status(400).json({ error: v.error });
    return;
  }
  let gallery: ReturnType<typeof parseGallery> = null;
  let galleryProvided = false;
  try {
    if (body.gallery !== undefined) {
      galleryProvided = true;
      gallery = parseGallery(body.gallery);
    }
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Galería inválida" });
    return;
  }
  try {
    const audience = String(body.audience ?? "all");
    const displayMode = body.displayMode === "modal" ? "modal" : "toast";

    // Use transaction to replace gallery items atomically
    const notice = await prisma.$transaction(async (tx: any) => {
      if (galleryProvided) {
        await tx.noticeGalleryItem.deleteMany({ where: { noticeId: id } });
      }
      return tx.appNotice.update({
        where: { id },
        data: {
          title: v.data.title,
          body: v.data.body,
          imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim() || null : null,
          videoUrl: typeof body.videoUrl === "string" ? body.videoUrl.trim() || null : null,
          ctaLabel: typeof body.ctaLabel === "string" ? body.ctaLabel.trim() || null : null,
          ctaUrl: typeof body.ctaUrl === "string" ? body.ctaUrl.trim() || null : null,
          variant: typeof body.variant === "string" ? body.variant : "info",
          audience,
          audienceZoneId: audience === "zone" && typeof body.audienceZoneId === "string" ? body.audienceZoneId.trim() : null,
          audiencePlatform: audience === "platform" && typeof body.audiencePlatform === "string" ? body.audiencePlatform.trim() : null,
          audienceProgram: audience === "program" && typeof body.audienceProgram === "string" ? body.audienceProgram.trim() : null,
          audienceDeviceIds: audience === "devices" && Array.isArray(body.audienceDeviceIds) ? JSON.stringify(body.audienceDeviceIds) : null,
          displayMode,
          startsAt: v.data.startsAt,
          endsAt: v.data.endsAt,
          maxDisplaysPerUser: Math.max(0, Math.min(100, Number(body.maxDisplaysPerUser) || 3)),
          dismissible: body.dismissible !== false,
          isActive: body.isActive !== false,
          ...(galleryProvided && gallery
            ? {
                galleryItems: {
                  create: gallery.map((g, idx) => ({
                    type: g.type,
                    url: g.url,
                    posterUrl: g.posterUrl,
                    sortOrder: idx,
                  })),
                },
              }
            : {}),
        },
        include: { galleryItems: { orderBy: { sortOrder: "asc" } } },
      });
    });

    res.json(mapNoticeWithGallery(notice));
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Aviso no encontrado" });
      return;
    }
    logger.error("NoticesAdmin", "update failed", { error: String(err) });
    res.status(500).json({ error: "Error al actualizar aviso" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    await prisma.appNotice.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      res.status(404).json({ error: "Aviso no encontrado" });
      return;
    }
    res.status(500).json({ error: "Error al eliminar aviso" });
  }
});

router.post("/preview", requireAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const audience = String(body.audience ?? "all") as never;
  try {
    const result = await previewPushCampaign({
      title: "preview",
      body: "preview",
      audience,
      zoneId: typeof body.audienceZoneId === "string" ? body.audienceZoneId : undefined,
      platform: typeof body.audiencePlatform === "string" ? body.audiencePlatform : undefined,
      program: typeof body.audienceProgram === "string" ? body.audienceProgram : undefined,
      deviceIds: Array.isArray(body.audienceDeviceIds) ? body.audienceDeviceIds.filter((x): x is string => typeof x === "string") : undefined,
    });
    res.json({ targeted: result.targeted });
  } catch (err) {
    logger.error("NoticesAdmin", "preview failed", { error: String(err) });
    res.status(500).json({ error: "Error en preview" });
  }
});

export default router;
