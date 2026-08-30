import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs";
import { requireAuth } from "../auth/auth.middleware";
import { logger } from "../../shared/logger/logger";
import {
  NOTICE_VIDEOS_DIR,
  ensureDir,
  getMediaFilePath,
  deleteMediaFileIfExists,
  writeMediaFile,
} from "./media/media.storage";
import { NOTICE_VIDEO_MAX_BYTES, NOTICE_VIDEO_URL_PREFIX, VIDEO_EXT_BY_MIME } from "./media/media.config";
import { isAllowedVideoMime } from "./media/media.validation";
import { optimizeVideo, cleanupTempFiles } from "./media/media.transcode";

const router = Router();

function getPrisma(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("../../infrastructure/database/prisma") as { prisma: any };
  return prisma as any;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: NOTICE_VIDEO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedVideoMime(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de video no permitido. Usa MP4, WebM, OGG, MOV, AVI o MKV."));
  },
});

/**
 * POST /admin-api/notices/videos - upload and optimize a video for notices.
 * Optimizes to 720p H.264 with faststart and generates a poster thumbnail for slow networks.
 */
router.post("/videos", requireAuth, upload.single("video"), async (req: Request, res: Response) => {
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "Archivo requerido" });
    return;
  }

  if (!isAllowedVideoMime(file.mimetype)) {
    res.status(400).json({ error: "Tipo de video no permitido. Usa MP4, WebM, OGG, MOV, AVI o MKV." });
    return;
  }

  const baseName = randomUUID();
  let optimized: Awaited<ReturnType<typeof optimizeVideo>> | null = null;

  try {
    ensureDir(NOTICE_VIDEOS_DIR);

    // Attempt optimization via ffmpeg (transcode + poster). Falls back to original on failure.
    optimized = await optimizeVideo(file.buffer, file.originalname, NOTICE_VIDEOS_DIR, baseName);

    let finalFilename: string;
    let finalMimeType: string;
    let finalSize: number;
    let width = optimized.width ?? null;
    let height = optimized.height ?? null;
    let durationMs = optimized.durationMs ?? null;
    let posterUrl: string | null = null;

    if (optimized.usedTranscode && fs.existsSync(optimized.outputPath)) {
      // Optimized file already in NOTICE_VIDEOS_DIR as baseName.mp4
      finalFilename = path.basename(optimized.outputPath);
      finalMimeType = "video/mp4";
      finalSize = optimized.size;
    } else {
      // Fallback: store original buffer with appropriate extension
      const ext = VIDEO_EXT_BY_MIME[file.mimetype] ?? path.extname(file.originalname) ?? ".mp4";
      finalFilename = `${baseName}${ext}`;
      const outPath = getMediaFilePath(NOTICE_VIDEOS_DIR, finalFilename);
      writeMediaFile(outPath, file.buffer);
      const stat = fs.statSync(outPath);
      finalSize = stat.size;
      finalMimeType = file.mimetype;
      // Cleanup temp input if optimization returned a temp path
      cleanupTempFiles([optimized.outputPath]);
    }

    // Handle poster thumbnail if generated
    if (optimized.posterPath && fs.existsSync(optimized.posterPath)) {
      const posterFilename = `${baseName}_poster.webp`;
      const posterDest = getMediaFilePath(NOTICE_VIDEOS_DIR, posterFilename);
      try {
        // Poster is already in NOTICE_VIDEOS_DIR if generated there; ensure correct name
        if (path.basename(optimized.posterPath) !== posterFilename) {
          fs.renameSync(optimized.posterPath, posterDest);
        }
        posterUrl = `${NOTICE_VIDEO_URL_PREFIX}/${posterFilename}`;
      } catch {
        posterUrl = null;
      }
      // Cleanup any intermediate poster file
      cleanupTempFiles([optimized.posterPath !== posterDest ? optimized.posterPath : null]);
    } else if (optimized.posterPath) {
      cleanupTempFiles([optimized.posterPath]);
    }

    const prisma = getPrisma();
    const record = await prisma.noticeVideo.create({
      data: {
        filename: finalFilename,
        originalName: file.originalname,
        url: `${NOTICE_VIDEO_URL_PREFIX}/${finalFilename}`,
        posterUrl,
        mimeType: finalMimeType,
        size: finalSize,
        width,
        height,
        durationMs,
      },
    });

    res.status(201).json({
      id: record.id,
      filename: record.filename,
      originalName: record.originalName,
      url: record.url,
      posterUrl: record.posterUrl ?? null,
      mimeType: record.mimeType,
      size: record.size,
      width: record.width ?? null,
      height: record.height ?? null,
      durationMs: record.durationMs ?? null,
      createdAt: record.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error("NoticeVideos", "upload failed", { error: String(err) });
    if (optimized) cleanupTempFiles([optimized.outputPath, optimized.posterPath]);
    const isValidation = err instanceof Error && err.message.includes("Tipo de video");
    res.status(isValidation ? 400 : 500).json({ error: isValidation ? (err as Error).message : "Error al guardar video" });
  }
});

/**
 * GET /admin-api/notices/videos - reusable video library with pagination.
 * Returns posterUrl for efficient thumbnail loading on slow networks.
 */
router.get("/videos", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.noticeVideo.findMany({ orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.noticeVideo.count(),
    ]);
    res.json({
      rows: rows.map((r: any) => ({
        id: r.id,
        filename: r.filename,
        originalName: r.originalName,
        url: r.url,
        posterUrl: r.posterUrl ?? null,
        mimeType: r.mimeType,
        size: r.size,
        width: r.width,
        height: r.height,
        durationMs: r.durationMs,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error("NoticeVideos", "list failed", { error: String(err) });
    res.status(500).json({ error: "Error al listar videos" });
  }
});

/**
 * DELETE /admin-api/notices/videos/:id - remove video and poster from DB and disk
 */
router.delete("/videos/:id", requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const row = await prisma.noticeVideo.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: "Video no encontrado" });
      return;
    }
    deleteMediaFileIfExists(getMediaFilePath(NOTICE_VIDEOS_DIR, row.filename));
    // Delete poster thumbnail if exists
    if (row.posterUrl) {
      const posterFilename = path.basename(row.posterUrl);
      deleteMediaFileIfExists(getMediaFilePath(NOTICE_VIDEOS_DIR, posterFilename));
    } else {
      // Legacy fallback: try to delete poster with baseName pattern
      const base = path.parse(row.filename).name;
      deleteMediaFileIfExists(getMediaFilePath(NOTICE_VIDEOS_DIR, `${base}_poster.webp`));
    }
    await prisma.noticeVideo.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    logger.error("NoticeVideos", "delete failed", { error: String(err) });
    res.status(500).json({ error: "Error al eliminar" });
  }
});

export default router;
