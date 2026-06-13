import { prisma } from "../lib/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import { getAvailableWorker, markWorkerBusy, markWorkerIdle } from "../workers/workerPool";
import { AssignJobMessage, JobDoneMessage, JobErrorMessage } from "../types/protocol.types";

const DEADLINE_MS = config.processing.jobDeadlineHours * 60 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour

function calculateNextRetry(attempts: number): Date {
  const delay = Math.min(2 ** (attempts - 1) * 60_000, MAX_BACKOFF_MS);
  return new Date(Date.now() + delay);
}

function isPastDeadline(job: { deadlineAt: Date | null; createdAt: Date }): boolean {
  if (job.deadlineAt) {
    return Date.now() > job.deadlineAt.getTime();
  }
  return Date.now() > job.createdAt.getTime() + DEADLINE_MS;
}

export async function dispatchPendingJobs(): Promise<void> {
  const now = new Date();
  const pendingJobs = await prisma.processingJob.findMany({
    where: {
      status: { in: ["PENDING", "RETRYING"] },
      AND: [
        { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        { OR: [{ deadlineAt: null }, { deadlineAt: { gt: now } }] },
      ],
    },
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
    take: 5,
  });

  for (const job of pendingJobs) {
    if (isPastDeadline(job)) {
      await abandonJob(job.id, "Deadline exceeded before dispatch");
      continue;
    }

    const worker = getAvailableWorker(config.workerHeartbeatTimeoutMs);
    if (!worker) break;

    const video = await prisma.youTubeVideo.findUnique({ where: { videoId: job.videoId } });
    if (!video) continue;

    markWorkerBusy(worker.workerId, job.id);

    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "ASSIGNED",
        workerId: worker.workerId,
        ...(job.startedAt ? {} : { startedAt: new Date() }),
        attempts: { increment: 1 },
        nextRetryAt: null,
      },
    });

    await prisma.workerNode.update({
      where: { workerId: worker.workerId },
      data: { currentJobId: job.id, status: "BUSY" },
    });

    const message: AssignJobMessage = {
      type: "assign_job",
      jobId: job.id,
      videoId: video.videoId,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      title: video.title,
      channelId: video.channelId,
      maxDurationSeconds: config.processing.maxDurationSeconds,
      uploadProxyUrl: `${config.publicUrl}/admin-api/workers/upload`,
      azuracast: {
        baseUrl: config.azuracast.publicUrl,
        apiKey: config.azuracast.apiKey,
        stationId: config.azuracast.stationId,
        playlistId: config.azuracast.playlistId,
      },
    };

    try {
      worker.socket.send(JSON.stringify(message));
      logger.info("JobDispatcher", "Job assigned", { jobId: job.id, workerId: worker.workerId });
    } catch (sendErr) {
      markWorkerIdle(worker.workerId, job.id);
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: job.status,
          workerId: null,
          startedAt: job.startedAt,
        },
      });
      await prisma.workerNode.update({
        where: { workerId: worker.workerId },
        data: { currentJobId: null, status: "ONLINE" },
      });
      logger.error("JobDispatcher", "Failed to send job to worker, rolled back", {
        jobId: job.id,
        workerId: worker.workerId,
        error: String(sendErr),
      });
    }
  }
}

export async function handleJobStatus(jobId: string, status: string): Promise<void> {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: { status },
  });

  await prisma.youTubeVideo.updateMany({
    where: { jobs: { some: { id: jobId } } },
    data: { status },
  });
}

export async function handleJobDone(message: JobDoneMessage): Promise<void> {
  const isIgnored = message.ignored === true;

  await prisma.processingJob.update({
    where: { id: message.jobId },
    data: { status: isIgnored ? "IGNORED" : "DONE", finishedAt: new Date(), nextRetryAt: null },
  });

  await prisma.youTubeVideo.updateMany({
    where: { jobs: { some: { id: message.jobId } } },
    data: {
      status: isIgnored ? "IGNORED" : "DONE",
      azuracastFileId: isIgnored ? null : message.azuracastFileId,
      azuracastPath: isIgnored ? null : message.azuracastPath,
      duration: message.duration,
    },
  });

  await prisma.workerNode.updateMany({
    where: { workerId: message.workerId },
    data: { status: "ONLINE", currentJobId: null },
  });

  logger.info("JobDispatcher", isIgnored ? "Job ignored" : "Job completed", { jobId: message.jobId });
}

export async function handleJobError(message: JobErrorMessage): Promise<void> {
  const job = await prisma.processingJob.findUnique({ where: { id: message.jobId } });
  if (!job) return;

  if (isPastDeadline(job)) {
    await abandonJob(job.id, message.error);
    await prisma.workerNode.updateMany({
      where: { workerId: message.workerId },
      data: { status: "ONLINE", currentJobId: null },
    });
    logger.warn("JobDispatcher", "Job failed after deadline", {
      jobId: message.jobId,
      error: message.error,
    });
    return;
  }

  if (!message.retryable) {
    await prisma.processingJob.update({
      where: { id: message.jobId },
      data: { status: "ERROR", lastError: message.error, finishedAt: new Date(), nextRetryAt: null },
    });
    await prisma.youTubeVideo.updateMany({
      where: { jobs: { some: { id: message.jobId } } },
      data: { status: "ERROR", lastError: message.error },
    });
    await prisma.workerNode.updateMany({
      where: { workerId: message.workerId },
      data: { status: "ONLINE", currentJobId: null },
    });
    logger.error("JobDispatcher", "Job failed with non-retryable error", {
      jobId: message.jobId,
      error: message.error,
    });
    return;
  }

  const nextRetry = calculateNextRetry(job.attempts + 1);

  await prisma.processingJob.update({
    where: { id: message.jobId },
    data: {
      status: "RETRYING",
      lastError: message.error,
      finishedAt: null,
      nextRetryAt: nextRetry,
    },
  });

  await prisma.youTubeVideo.updateMany({
    where: { jobs: { some: { id: message.jobId } } },
    data: { status: "RETRYING", lastError: message.error },
  });

  await prisma.workerNode.updateMany({
    where: { workerId: message.workerId },
    data: { status: "ONLINE", currentJobId: null },
  });

  logger.warn("JobDispatcher", "Job failed, will retry", {
    jobId: message.jobId,
    attempts: job.attempts + 1,
    nextRetryAt: nextRetry.toISOString(),
    error: message.error,
  });
}

async function abandonJob(jobId: string, lastError: string): Promise<void> {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: { status: "ABANDONED", lastError, finishedAt: new Date(), nextRetryAt: null },
  });

  await prisma.youTubeVideo.updateMany({
    where: { jobs: { some: { id: jobId } } },
    data: { status: "ABANDONED", lastError },
  });

  logger.error("JobDispatcher", "Job abandoned", { jobId, lastError });
}

export async function recoverStaleJobs(): Promise<void> {
  const now = new Date();

  const staleAssigned = await prisma.processingJob.findMany({
    where: {
      status: "ASSIGNED",
      updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
  });

  for (const job of staleAssigned) {
    if (isPastDeadline(job)) {
      await abandonJob(job.id, "Worker timed out and deadline exceeded");
    } else {
      if (job.workerId) {
        markWorkerIdle(job.workerId, job.id);
        await prisma.workerNode.updateMany({
          where: { workerId: job.workerId },
          data: { status: "ONLINE", currentJobId: null },
        });
      }
      await prisma.processingJob.update({
        where: { id: job.id },
        data: { status: "RETRYING", workerId: null, nextRetryAt: now },
      });
      await prisma.youTubeVideo.updateMany({
        where: { jobs: { some: { id: job.id } } },
        data: { status: "RETRYING" },
      });
      logger.warn("JobDispatcher", "Recovered stale assigned job", { jobId: job.id });
    }
  }

  const oldErrors = await prisma.processingJob.findMany({
    where: {
      status: "ERROR",
      OR: [{ deadlineAt: null }, { deadlineAt: { gt: now } }],
    },
  });

  for (const job of oldErrors) {
    if (isPastDeadline(job)) {
      await abandonJob(job.id, job.lastError ?? "Deadline exceeded");
    } else {
      await prisma.processingJob.update({
        where: { id: job.id },
        data: { status: "RETRYING", nextRetryAt: now },
      });
      await prisma.youTubeVideo.updateMany({
        where: { jobs: { some: { id: job.id } } },
        data: { status: "RETRYING" },
      });
      logger.warn("JobDispatcher", "Recovered old error job", { jobId: job.id });
    }
  }
}
