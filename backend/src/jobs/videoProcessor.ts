import { prisma } from "../lib/prisma";
import { VideoJob } from "../types/youtube.types";
import { fetchVideoMetadata, exceedsMaxDuration } from "../services/youtube/metadata.service";
import { downloadAsMp3, cleanupLocalFile } from "../services/youtube/download.service";
import { uploadMp3ToAzuracast } from "../services/azuracast/upload.service";
import { enqueueVideo } from "./videoQueue";
import { config } from "../config";
import { logger } from "../utils/logger";

export async function processVideo(job: VideoJob): Promise<void> {
  const { videoId, channelId, title, publishedAt, attempt } = job;
  const context = "VideoProcessor";

  logger.info(context, "Processing started", { videoId, attempt });

  await updateStatus(videoId, "CHECKING_METADATA", { attempts: attempt });

  const metadata = await fetchVideoMetadata(videoId);

  if (!metadata.isAvailable) {
    await updateStatus(videoId, "ERROR", { lastError: "Video not available or metadata fetch failed" });
    return;
  }

  if (exceedsMaxDuration(metadata.duration)) {
    logger.info(context, "Video ignored: exceeds max duration", { videoId, duration: metadata.duration });
    await updateStatus(videoId, "IGNORED", { duration: metadata.duration });
    return;
  }

  await updateStatus(videoId, "DOWNLOADING", { duration: metadata.duration });

  let localPath: string | null = null;

  try {
    localPath = await downloadAsMp3(videoId);

    await updateStatus(videoId, "UPLOADING", { localPath });

    const playlistId = config.azuracast.playlistId || undefined;
    const { fileId, azuraPath } = await uploadMp3ToAzuracast(localPath, title, playlistId);

    await updateStatus(videoId, "DONE", {
      azuracastFileId: fileId,
      azuracastPath: azuraPath,
      localPath: null,
    });

    cleanupLocalFile(localPath);
    logger.info(context, "Processing complete", { videoId, azuraPath });

  } catch (err) {
    const errorMessage = String(err);
    logger.error(context, "Processing failed", { videoId, attempt, error: errorMessage });

    if (localPath) cleanupLocalFile(localPath);

    if (attempt < config.processing.maxRetryAttempts) {
      await updateStatus(videoId, "RETRYING", { lastError: errorMessage });
      const delay = attempt * 30_000;
      setTimeout(() => {
        enqueueVideo({ videoId, channelId, title, publishedAt, attempt: attempt + 1 });
      }, delay);
    } else {
      await updateStatus(videoId, "ERROR", { lastError: errorMessage });
      logger.error(context, "Max retry attempts reached", { videoId });
    }
  }
}

async function updateStatus(
  videoId: string,
  status: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await prisma.youTubeVideo.update({
    where: { videoId },
    data: { status, ...extra } as never,
  });
}