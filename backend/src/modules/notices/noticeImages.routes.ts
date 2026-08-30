import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { requireAuth } from "../auth/auth.middleware";
import { logger } from "../../shared/logger/logger";
import { NOTICE_IMAGES_DIR, ensureDir, getMediaFilePath, deleteMediaFileIfExists } from "./media/media.storage";
import { ALLOWED_IMAGE_MIMES, NOTICE_IMAGE_MAX_BYTES, NOTICE_IMAGE_URL_PREFIX } from "./media/media.config";
import { isAllowedImageMime } from "./media/media.validation";

const router = Router();

function getPrisma(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("../../infrastructure/database/prisma") as { prisma: any };
  return prisma as any;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: NOTICE_IMAGE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedImageMime(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de imagen no permitido. Usa JPG, PNG, WebP, GIF o AVIF."));
  },
});

/**
 * POST /admin-api/notices/images - upload and optimize an image for notices.
 * Optimization: resize to max 1280x900, convert to WebP quality 82, strip metadata.
 */
router.post("/images", requireAuth, upload.single("image"), async (req: Request, res: Response) => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "Archivo requerido" });
    return;
  }

  // Validate mime again to provide user-facing error in Spanish
  if (!isAllowedImageMime(file.mimetype)) {
    res.status(400).json({ error: "Tipo de imagen no permitido. Usa JPG, PNG, WebP, GIF o AVIF." });
    return;
  }

  try {
    ensureDir(NOTICE_IMAGES_DIR);
    const filename = `${randomUUID()}.webp`;
    const outPath = getMediaFilePath(NOTICE_IMAGES_DIR, filename);

    const pipeline = sharp(file.buffer)
      .rotate()
      .resize({ width: 1280, height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 });

    const info = await pipeline.toFile(outPath);
    const width = (info as unknown as { width: number }).width;
    const height = (info as unknown as { height: number }).height;
    const stat = fs.statSync(outPath);

    const prisma = getPrisma();
    const record = await prisma.noticeImage.create({
      data: {
        filename,
        originalName: file.originalname,
        url: `${NOTICE_IMAGE_URL_PREFIX}/${filename}`,
        mimeType: "image/webp",
        size: stat.size,
        width: width ?? null,
        height: height ?? null,
      },
    });

    res.status(201).json({
      id: record.id,
      filename: record.filename,
      originalName: record.originalName,
      url: record.url,
      mimeType: record.mimeType,
      size: record.size,
      width: record.width,
      height: record.height,
      createdAt: record.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error("NoticeImages", "upload failed", { error: String(err) });
    const isValidation = err instanceof Error && err.message.includes("Tipo de imagen");
    res.status(isValidation ? 400 : 500).json({ error: isValidation ? err.message : "Error al optimizar imagen" });
  }
});

/**
 * GET /admin-api/notices/images - reusable library with pagination
 */
router.get("/images", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.noticeImage.findMany({ orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.noticeImage.count(),
    ]);
    res.json({
      rows: rows.map((r: any) => ({
        id: r.id,
        filename: r.filename,
        originalName: r.originalName,
        url: r.url,
        mimeType: r.mimeType,
        size: r.size,
        width: r.width,
        height: r.height,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error("NoticeImages", "list failed", { error: String(err) });
    res.status(500).json({ error: "Error al listar imágenes" });
  }
});

/**
 * DELETE /admin-api/notices/images/:id - remove from DB and disk
 */
router.delete("/images/:id", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const row = await prisma.noticeImage.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: "Imagen no encontrada" });
      return;
    }
    deleteMediaFileIfExists(getMediaFilePath(NOTICE_IMAGES_DIR, row.filename));
    await prisma.noticeImage.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error("NoticeImages", "delete failed", { error: String(err) });
    res.status(500).json({ error: "Error al eliminar" });
  }
});

export default router;
