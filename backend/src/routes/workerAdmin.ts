import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import { getAllWorkers } from "../workers/workerPool";
import { prisma } from "../lib/prisma";
import { uploadMp3ToAzuracast } from "../services/azuracast/upload.service";
import { logger } from "../utils/logger";

const router = Router();
const upload = multer({ dest: "uploads/" });

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
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const title = req.body.title || req.file.originalname;
    const playlistId = req.body.playlistId || undefined;

    try {
      const result = await uploadMp3ToAzuracast(req.file.path, title, playlistId);
      fs.unlinkSync(req.file.path);
      res.json(result);
    } catch (err) {
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch {}
      logger.error("WorkerAdmin", "Proxy upload to AzuraCast failed", { error: String(err) });
      res.status(502).json({ error: String(err) });
    }
  }
);

export default router;