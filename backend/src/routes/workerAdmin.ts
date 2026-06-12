import { Router, Request, Response } from "express";
import { getAllWorkers } from "../workers/workerPool";
import { prisma } from "../lib/prisma";

const router = Router();

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

export default router;