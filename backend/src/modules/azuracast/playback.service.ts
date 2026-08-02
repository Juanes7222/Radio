import { prisma } from "../../infrastructure/database/prisma";
import { azuracastApi, STATION_ID } from "./azuracast.client";
import { logger } from "../../shared/logger/logger";
import { playFileAsLive } from "../locutor/streamer.service";
import { uploadMp3ToAzuracast } from "./upload-mp3.service";

/**
 * Uploads an audio file to AzuraCast and returns the media ID.
 */
export async function uploadAudioToAzuraCast(filePath: string, filename: string): Promise<string> {
  const title = filename.replace(/\.mp3$/, "");
  const result = await uploadMp3ToAzuracast(filePath, title, "", undefined, "locutores");
  logger.info("PlaybackAzuracast", "Uploaded audio to AzuraCast", {
    mediaId: result.fileId,
    azuraPath: result.azuraPath,
    filename,
  });
  return result.fileId;
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
  } catch (err) {
    logger.error("PlaybackAzuracast", "Failed to play announcement via streamer", {
      hour,
      audioId: audio.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Returns whether the station currently reports a live source
 * connected (i.e. Liquidsoap is on the live harbor input).
 */
export async function isLiveActive(): Promise<boolean> {
  try {
    const { data } = await azuracastApi.get(`/nowplaying/${STATION_ID}`);
    return data?.live?.is_live === true;
  } catch (err) {
    logger.warn("PlaybackAzuracast", "Failed to check live status", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Best-effort kick of the live source so Liquidsoap falls back to
 * the auto-DJ. Used when the locutor connection leaves the switch
 * stuck on the live input.
 */
export async function disconnectLiveSource(): Promise<void> {
  try {
    await azuracastApi.post(`/station/${STATION_ID}/backend/disconnect`);
    logger.warn("PlaybackAzuracast", "Live source disconnected after stuck switch");
  } catch (err) {
    logger.error("PlaybackAzuracast", "Failed to disconnect live source", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
