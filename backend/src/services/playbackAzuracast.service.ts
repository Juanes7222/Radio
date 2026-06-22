import axios from "axios";
import { prisma } from "../lib/prisma";
import { getOrCreatePlaylist, addMediaToPlaylist } from "./azuracast.service";
import { uploadMp3ToAzuracast } from "./azuracast/upload.service";
import { config } from "../config";
import { logger } from "../utils/logger";

const PLAYLIST_NAME = "Avisos de Hora";

let cachedPlaylistId: string | null = null;

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
  timeout: 10_000,
});

const STATION = config.azuracast.stationId;

async function getPlaylistId(): Promise<string> {
  if (cachedPlaylistId) return cachedPlaylistId;
  cachedPlaylistId = await getOrCreatePlaylist(PLAYLIST_NAME);
  return cachedPlaylistId;
}

/**
 * Uploads an audio file to AzuraCast and returns the media ID.
 * Uses the proven base64+JSON approach to avoid AzuraCast's multipart deserialization bug.
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
 * Assigns an uploaded media to the Time Announcements playlist.
 */
export async function addToAnnouncementPlaylist(mediaId: string): Promise<void> {
  try {
    const playlistId = await getPlaylistId();
    await addMediaToPlaylist(playlistId, mediaId);
    logger.info("PlaybackAzuracast", "Added to announcement playlist", { mediaId, playlistId });
  } catch (err: any) {
    logger.warn("PlaybackAzuracast", "Could not add to playlist", { mediaId, error: err.message });
  }
}

/**
 * Pushes the media item into the upcoming playback queue.
 * This avoids cutting off the current song and handles transitions smoothly.
 */
export async function queueAnnouncementNext(mediaId: string): Promise<void> {
  try {
    await azApi.post(`/station/${STATION}/queue`, {
      media_id: mediaId,
      is_asap: true,
    });
    logger.info("PlaybackAzuracast", "Queued announcement successfully", { mediaId });
  } catch (err: any) {
    logger.error("PlaybackAzuracast", "Failed to queue announcement", { mediaId, error: err.message });
    throw err;
  }
}

/**
 * Finds the scheduled audio for the current hour and plays it.
 * Returns true if an announcement was played.
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

  if (schedule.audio.status !== "ready") {
    logger.warn("PlaybackAzuracast", "Scheduled audio not ready", { hour, audioId: schedule.audio.id, status: schedule.audio.status });
    return false;
  }

  if (!schedule.audio.azuracastMediaId) {
    logger.warn("PlaybackAzuracast", "Scheduled audio has no AzuraCast media ID", { hour, audioId: schedule.audio.id });
    return false;
  }

  try {
    await queueAnnouncementNext(schedule.audio.azuracastMediaId);

    await prisma.audioSchedule.update({
      where: { id: schedule.id },
      data: { playedAt: new Date() },
    });

    logger.info("PlaybackAzuracast", "Processed scheduled announcement queueing", {
      hour,
      audioId: schedule.audio.id,
      mediaId: schedule.audio.azuracastMediaId,
    });

    return true;
  } catch (err: any) {
    logger.error("PlaybackAzuracast", "Failed to process scheduled announcement", { hour, error: err.message });
    return false;
  }
}