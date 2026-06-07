import { VideoJob } from "../types/youtube.types";
import { logger } from "../utils/logger";
import { processVideo } from "./videoProcessor";

const queue: VideoJob[] = [];
let isWorkerRunning = false;

export function enqueueVideo(job: VideoJob): void {
  queue.push(job);
  logger.info("VideoQueue", "Job enqueued", { videoId: job.videoId, attempt: job.attempt });
  scheduleWorker();
}

function scheduleWorker(): void {
  if (isWorkerRunning) return;
  setImmediate(runWorker);
}

async function runWorker(): Promise<void> {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      await processVideo(job);
    } catch (err) {
      logger.error("VideoQueue", "Unhandled error in worker", {
        videoId: job.videoId,
        error: String(err),
      });
    }
  }

  isWorkerRunning = false;
}