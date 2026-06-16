import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { getAllWorkers } from "../workers/workerPool";
import { prisma } from "../lib/prisma";
import { uploadMp3ToAzuracast } from "../services/azuracast/upload.service";
import { logger } from "../utils/logger";
import { config } from "../config";

const router = Router();

const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "lavoz-worker-uploads");
if (!fs.existsSync(UPLOAD_TMP_DIR)) {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
}

const upload = multer({ dest: UPLOAD_TMP_DIR });

function validateWorkerAuth(req: Request, res: Response): boolean {
  const secret = req.headers["x-worker-secret"] as string | undefined;
  if (secret !== config.worker.authSecret) {
    res.status(403).json({ error: "Invalid worker secret" });
    return false;
  }
  return true;
}

router.get("/workers", (_req: Request, res: Response) => {
  const workers = getAllWorkers().map((w) => ({
    workerId: w.workerId,
    name: w.name,
    status: w.status,
    maxConcurrentJobs: w.maxConcurrentJobs,
    currentJobs: w.currentJobs,
    currentJobId: w.currentJobId,
    lastSeenAt: w.lastSeenAt,
  }));
  res.json(workers);
});

router.get("/jobs", async (_req: Request, res: Response) => {
  const jobs = await prisma.processingJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { video: { select: { title: true, videoId: true } } },
  });
  res.json(jobs);
});

async function processBackgroundUpload(
  jobId: string,
  videoId: string,
  filePath: string,
  title: string,
  playlistId: string | undefined,
  folder: string | undefined
): Promise<void> {
  try {
    logger.info("WorkerAdmin", "Background upload to AzuraCast started", { jobId, videoId });
    const result = await uploadMp3ToAzuracast(filePath, title, playlistId, folder);

    await prisma.youTubeVideo.updateMany({
      where: { videoId },
      data: {
        status: "DONE",
        azuracastFileId: result.fileId,
        azuracastPath: result.azuraPath,
      },
    });

    logger.info("WorkerAdmin", "Background upload to AzuraCast completed", {
      jobId,
      videoId,
      fileId: result.fileId,
    });
  } catch (err) {
    logger.error("WorkerAdmin", "Background upload to AzuraCast failed", {
      jobId,
      videoId,
      error: String(err),
    });
    await prisma.youTubeVideo.updateMany({
      where: { videoId },
      data: { status: "UPLOAD_PENDING", lastError: String(err) },
    });
  } finally {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (cleanupErr) {
      logger.warn("WorkerAdmin", "Failed to cleanup background upload file", {
        path: filePath,
        error: String(cleanupErr),
      });
    }
  }
}

router.post(
  "/upload",
  (req: Request, res: Response, next) => {
    req.setTimeout(600_000);
    res.setTimeout(600_000);
    next();
  },
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!validateWorkerAuth(req, res)) return;

    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const jobId = req.body.jobId || (req.headers["x-job-id"] as string | undefined);
    if (!jobId) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "jobId is required" });
      return;
    }

    const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
    if (!job) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const video = await prisma.youTubeVideo.findUnique({ where: { videoId: job.videoId } });
    const isNewsChannel = config.youtube.noticeChanelIds.includes(video?.channelId ?? "");
    const playlistId = req.body.playlistId || (isNewsChannel ? config.azuracast.newsPlaylistId : config.azuracast.playlistId) || undefined;
    const folder = isNewsChannel ? "NOTICIAS" : "CONTENIDO VARIADO";

    const title = req.body.title || req.file.originalname;
    const filePath = req.file.path;
    const videoId = job.videoId;

    await prisma.youTubeVideo.updateMany({
      where: { videoId },
      data: { status: "UPLOAD_PENDING", lastError: null },
    });

    res.status(202).json({ accepted: true, jobId });

    setImmediate(() => {
        void processBackgroundUpload(jobId, videoId, filePath, title, playlistId, folder);
    });
  }
);

export default router;
