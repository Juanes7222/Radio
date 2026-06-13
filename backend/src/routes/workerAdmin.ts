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

router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!validateWorkerAuth(req, res)) return;

    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const title = req.body.title || req.file.originalname;
    const playlistId = req.body.playlistId || undefined;

    let cleanupDone = false;
    function cleanup(): void {
      if (cleanupDone) return;
      cleanupDone = true;
      try {
        if (fs.existsSync(req.file!.path)) fs.unlinkSync(req.file!.path);
      } catch (cleanupErr) {
        logger.warn("WorkerAdmin", "Failed to cleanup temp upload", {
          path: req.file!.path,
          error: String(cleanupErr),
        });
      }
    }

    try {
      const result = await uploadMp3ToAzuracast(req.file.path, title, playlistId);
      cleanup();
      res.json(result);
    } catch (err) {
      cleanup();
      logger.error("WorkerAdmin", "Proxy upload to AzuraCast failed", { error: String(err) });
      res.status(502).json({ error: String(err) });
    }
  }
);

export default router;
