import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { dispatchJobById } from "../jobs/jobDispatcher";

const router = Router();

type DispatchMode =
  | "eligible"
  | "pending"
  | "retrying"
  | "assigned"
  | "error"
  | "abandoned"
  | "any";

type JobSummary = {
  id: string;
  videoId: string;
  status: string;
  attempts: number;
  workerId: string | null;
  nextRetryAt: Date | null;
  deadlineAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastError: string | null;
};

function parseMode(input: unknown): DispatchMode {
  const value = String(input ?? "eligible").toLowerCase();

  if (
    value === "eligible" ||
    value === "pending" ||
    value === "retrying" ||
    value === "assigned" ||
    value === "error" ||
    value === "abandoned" ||
    value === "any"
  ) {
    return value;
  }

  return "eligible";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildWhere(mode: DispatchMode, videoId?: string): Prisma.ProcessingJobWhereInput {
  const now = new Date();
  const base: Prisma.ProcessingJobWhereInput = videoId ? { videoId } : {};

  switch (mode) {
    case "eligible":
      return {
        ...base,
        status: { in: ["PENDING", "RETRYING"] },
        AND: [
          { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
          { OR: [{ deadlineAt: null }, { deadlineAt: { gt: now } }] },
        ],
      };

    case "pending":
      return { ...base, status: "PENDING" };

    case "retrying":
      return { ...base, status: "RETRYING" };

    case "assigned":
      return { ...base, status: "ASSIGNED" };

    case "error":
      return { ...base, status: "ERROR" };

    case "abandoned":
      return { ...base, status: "ABANDONED" };

    case "any":
    default:
      return base;
  }
}

function selectFields() {
  return {
    id: true,
    videoId: true,
    status: true,
    attempts: true,
    workerId: true,
    nextRetryAt: true,
    deadlineAt: true,
    startedAt: true,
    finishedAt: true,
    createdAt: true,
    updatedAt: true,
    lastError: true,
  } as const;
}

async function getRandomJob(where: Prisma.ProcessingJobWhereInput): Promise<JobSummary | null> {
  const count = await prisma.processingJob.count({ where });
  if (count === 0) return null;

  const skip = Math.floor(Math.random() * count);

  const job = await prisma.processingJob.findFirst({
    where,
    skip,
    orderBy: { createdAt: "desc" },
    select: selectFields(),
  });

  return job;
}

router.get("/test-dispatch/jobs", async (req, res) => {
  try {
    const mode = parseMode(req.query.mode);
    const videoId = req.query.videoId ? String(req.query.videoId) : undefined;
    const limit = clamp(parseInt(String(req.query.limit ?? "25"), 10) || 25, 1, 100);

    const jobs = await prisma.processingJob.findMany({
      where: buildWhere(mode, videoId),
      orderBy: [{ nextRetryAt: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: selectFields(),
    });

    res.json({
      ok: true,
      mode,
      videoId: videoId ?? null,
      count: jobs.length,
      jobs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

router.post("/test-dispatch/random", async (req, res) => {
  try {
    const mode = parseMode(req.body?.mode ?? req.query.mode);
    const videoId = req.body?.videoId ? String(req.body.videoId) : req.query.videoId ? String(req.query.videoId) : undefined;

    const job = await getRandomJob(buildWhere(mode, videoId));
    if (!job) {
      return res.status(404).json({
        ok: false,
        error: "No matching job found",
        mode,
        videoId: videoId ?? null,
      });
    }

    await dispatchJobById(job.id);

    const updated = await prisma.processingJob.findUnique({
      where: { id: job.id },
      select: selectFields(),
    });

    res.json({
      ok: true,
      mode,
      videoId: videoId ?? null,
      selectedJob: job,
      updatedJob: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("No available workers") ? 503 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

router.post("/test-dispatch/dispatch", async (req, res) => {
  try {
    const jobId = String(req.body?.jobId ?? req.query.jobId ?? "").trim();

    if (!jobId) {
      return res.status(400).json({
        ok: false,
        error: "jobId is required",
      });
    }

    const before = await prisma.processingJob.findUnique({
      where: { id: jobId },
      select: selectFields(),
    });

    if (!before) {
      return res.status(404).json({
        ok: false,
        error: "Job not found",
      });
    }

    await dispatchJobById(jobId);

    const after = await prisma.processingJob.findUnique({
      where: { id: jobId },
      select: selectFields(),
    });

    res.json({
      ok: true,
      before,
      after,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("No available workers") ? 503 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

export default router;