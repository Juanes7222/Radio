import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { requireAuth } from "../auth/auth.middleware";
import { logger } from "../../shared/logger/logger";

const router = Router();

function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("../../infrastructure/database/prisma") as { prisma: any };
  return prisma as any;
}

const NOTICE_IMAGES_DIR = path.resolve(process.cwd(), "backend", "storage", "notice-images");

// asegura directorio
function ensureDir(): void {
  try {
    fs.mkdirSync(NOTICE_IMAGES_DIR, { recursive: true });
  } catch {}
}
ensureDir();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de imagen no permitido. Usa JPG, PNG, WebP, GIF o AVIF."));
  },
});

/**
 * POST /admin-api/notices/images — sube y optimiza una imagen para popups.
 * Optimización: redimensiona a max 1280px, convierte a WebP quality 82, strip metadata.
 */
router.post("/images", requireAuth, upload.single("image"), async (req: Request, res: Response) => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) { res.status(400).json({ error: "Archivo requerido" }); return; }
  try {
    ensureDir();
    const filename = `${randomUUID()}.webp`;
    const outPath = path.join(NOTICE_IMAGES_DIR, filename);

    const pipeline = sharp(file.buffer)
      .rotate()
      .resize({ width: 1280, height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 });

    const info = await pipeline.toFile(outPath);
    const width = (info as unknown as { width: number }).width;
    const height = (info as unknown as { height: number }).height;
    const stat = fs.statSync(outPath);

    // Si sharp falló en obtener dims, usa stat
    const finalW = width ?? undefined;
    const finalH = height ?? undefined;

    const prisma = getPrisma();
    const record = await prisma.noticeImage.create({
      data: {
        filename,
        originalName: file.originalname,
        url: `/media/notices/${filename}`,
        mimeType: "image/webp",
        size: stat.size,
        width: finalW ?? null,
        height: finalH ?? null,
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
    res.status(500).json({ error: "Error al optimizar imagen" });
  }
});

/**
 * GET /admin-api/notices/images — biblioteca reusable
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
 * DELETE /admin-api/notices/images/:id
 */
router.delete("/images/:id", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const row = await prisma.noticeImage.findUnique({ where: { id: req.params.id } });
    if (!row) { res.status(404).json({ error: "Imagen no encontrada" }); return; }
    const filePath = path.join(NOTICE_IMAGES_DIR, row.filename);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    await prisma.noticeImage.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error("NoticeImages", "delete failed", { error: String(err) });
    res.status(500).json({ error: "Error al eliminar" });
  }
});

export default router;
