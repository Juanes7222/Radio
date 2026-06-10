import { prisma } from "../lib/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import { getAvailableWorker, markWorkerBusy, markWorkerIdle } from "../workers/workerPool";
import { AssignJobMessage, JobDoneMessage, JobErrorMessage } from "../types/protocol.types";

const MAX_RETRY_ATTEMPTS = config.processing.maxRetryAttempts;

export async function dispatchPendingJobs(): Promise<void> {
  const pendingJobs = await prisma.processingJob.findMany({
    where: { status: { in: ["PENDING", "RETRYING"] } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  for (const job of pendingJobs) {
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
      azuracast: {
        baseUrl: config.azuracast.baseUrl,
        apiKey: config.azuracast.apiKey,
        stationId: config.azuracast.stationId,
        playlistId: config.azuracast.playlistId,
      },
    };

    try {
      worker.socket.send(JSON.stringify(message));
      logger.info("JobDispatcher", "Job assigned", { jobId: job.id, workerId: worker.workerId });
    } catch (sendErr) {
      // Rollback: worker no recibió el mensaje
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
  await prisma.processingJob.update({
    where: { id: message.jobId },
    data: { status: "DONE", finishedAt: new Date() },
  });

  await prisma.youTubeVideo.updateMany({
    where: { jobs: { some: { id: message.jobId } } },
    data: {
      status: "DONE",
      azuracastFileId: message.azuracastFileId,
      azuracastPath: message.azuracastPath,
      duration: message.duration,
    },
  });

  await prisma.workerNode.updateMany({
    where: { workerId: message.workerId },
    data: { status: "ONLINE", currentJobId: null },
  });

  logger.info("JobDispatcher", "Job completed", { jobId: message.jobId });
}

export async function handleJobError(message: JobErrorMessage): Promise<void> {
  const job = await prisma.processingJob.findUnique({ where: { id: message.jobId } });
  if (!job) return;

  const shouldRetry = message.retryable && job.attempts < MAX_RETRY_ATTEMPTS;
  const newStatus = shouldRetry ? "RETRYING" : "ERROR";

  await prisma.processingJob.update({
    where: { id: message.jobId },
    data: { status: newStatus, lastError: message.error, finishedAt: shouldRetry ? null : new Date() },
  });

  await prisma.youTubeVideo.updateMany({
    where: { jobs: { some: { id: message.jobId } } },
    data: { status: newStatus, lastError: message.error },
  });

  await prisma.workerNode.updateMany({
    where: { workerId: message.workerId },
    data: { status: "ONLINE", currentJobId: null },
  });

  logger.warn("JobDispatcher", "Job failed", {
    jobId: message.jobId,
    retryable: message.retryable,
    attempts: job.attempts,
    willRetry: shouldRetry,
  });
}
