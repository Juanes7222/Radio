import { config } from "../../config";
import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";

export interface IngestVideoInput {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: Date | null;
}

function isDuplicate(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * Turns an upload into one video and one processing job. The unique `videoId` is
 * the deduplication point: push and polling can report the same upload, and only
 * the first report creates the job.
 *
 * The caller checks that the channel is registered: a video from a removed channel
 * would put on air content the admin deliberately took off the list.
 */
export async function ingestVideo(input: IngestVideoInput): Promise<boolean> {
  try {
    await prisma.youTubeVideo.create({
      data: {
        videoId: input.videoId,
        channelId: input.channelId,
        title: input.title,
        publishedAt: input.publishedAt,
        status: "RECEIVED",
        attempts: 0,
      },
    });
  } catch (err) {
    if (isDuplicate(err)) return false;
    throw err;
  }

  await prisma.youTubeChannel.updateMany({
    where: { channelId: input.channelId },
    data: { lastNotifiedAt: new Date() },
  });

  await prisma.processingJob.create({
    data: {
      videoId: input.videoId,
      status: "PENDING",
      deadlineAt: new Date(Date.now() + config.processing.jobDeadlineHours * 60 * 60 * 1000),
    },
  });

  logger.info("YoutubeIngest", "Job created", { videoId: input.videoId, channelId: input.channelId });
  return true;
}
