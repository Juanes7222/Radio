import { prisma } from "../lib/prisma";
import { uploadMp3ToAzuracast } from "./azuracast/upload.service";
import { playFileAsLive } from "./locutorStreamer.service";
import { logger } from "../utils/logger";

/**
 * Uploads an audio file to AzuraCast and returns the media ID.
 * Kept for record-keeping; playback now uses the live streamer approach.
 */
export async function uploadAudioToAzuraCast(filePath: string, filename: string): Promise<string> {
  try {
    const title = filename.replace(/\.mp3$/, "");
    const result = await uploadMp3ToAzuracast(filePath, title, "", undefined, "locutores");
    logger.info("PlaybackAzuracast", "Uploaded audio to AzuraCast", {
      mediaId: result.fileId,
      azuraPath: result.azuraPath,
      filename,
    });
    return result.fileId;
  } catch (err: any) {
    logger.error("PlaybackAzuracast", "Failed to upload audio", {
      filePath,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Finds the scheduled audio for the given hour and plays it via the
 * Icecast live streamer connection. Returns true if played.
 */
export async function playScheduledAnnouncementForHour(hour: number): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const schedule = await prisma.audioSchedule.findFirst({
    where: {
      scheduledDate: today,
      scheduledHour: hour,
      enabled: true,
    },
    include: {
      audio: true,
    },
  });

  if (!schedule || !schedule.audio) {
    logger.info("PlaybackAzuracast", "No scheduled announcement for this hour", { hour });
    return false;
  }

  const audio = schedule.audio;

  if (audio.status !== "ready") {
    logger.warn("PlaybackAzuracast", "Scheduled audio not ready", {
      hour,
      audioId: audio.id,
      status: audio.status,
    });
    return false;
  }

  const filePath = audio.filepath;
  if (!filePath) {
    logger.warn("PlaybackAzuracast", "Scheduled audio has no local file path", {
      hour,
      audioId: audio.id,
    });
    return false;
  }

  try {
    await playFileAsLive(filePath);

    await prisma.audioSchedule.update({
      where: { id: schedule.id },
      data: { playedAt: new Date() },
    });

    logger.info("PlaybackAzuracast", "Played announcement via live streamer", {
      hour,
      audioId: audio.id,
      filePath,
    });

    return true;
  } catch (err: any) {
    logger.error("PlaybackAzuracast", "Failed to play announcement via streamer", {
      hour,
      audioId: audio.id,
      error: err.message,
    });
    return false;
  }
}
