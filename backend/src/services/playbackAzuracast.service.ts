import { prisma } from "../lib/prisma";
import { uploadMedia, forcePlayAnnouncement, getOrCreatePlaylist, addMediaToPlaylist } from "./azuracast.service";
import { config } from "../config";
import { logger } from "../utils/logger";

const PLAYLIST_NAME = "Avisos de Hora";

let cachedPlaylistId: string | null = null;

async function getPlaylistId(): Promise<string> {
  if (cachedPlaylistId) return cachedPlaylistId;
  cachedPlaylistId = await getOrCreatePlaylist(PLAYLIST_NAME);
  return cachedPlaylistId;
}

/**
 * Uploads an audio file to AzuraCast and returns the media ID.
 */
export async function uploadAudioToAzuraCast(filePath: string, filename: string): Promise<string> {
  try {
    const remotePath = `locutores/${filename}`;
    const mediaId = await uploadMedia(filePath, remotePath);
    logger.info("PlaybackAzuracast", "Uploaded audio to AzuraCast", { mediaId, filename });
    return mediaId;
  } catch (err: any) {
    logger.error("PlaybackAzuracast", "Failed to upload audio", { filePath, error: err.message });
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
 * Injects an announcement directly into the station queue.
 * This is the most reliable way to play at an exact time.
 */
export async function playAnnouncementNow(mediaId: string): Promise<void> {
  try {
    await forcePlayAnnouncement(mediaId);
    logger.info("PlaybackAzuracast", "Injected announcement into queue", { mediaId });
  } catch (err: any) {
    logger.error("PlaybackAzuracast", "Failed to inject announcement", { mediaId, error: err.message });
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
    await playAnnouncementNow(schedule.audio.azuracastMediaId);

    await prisma.audioSchedule.update({
      where: { id: schedule.id },
      data: { playedAt: new Date() },
    });

    logger.info("PlaybackAzuracast", "Played scheduled announcement", {
      hour,
      audioId: schedule.audio.id,
      mediaId: schedule.audio.azuracastMediaId,
    });

    return true;
  } catch (err: any) {
    logger.error("PlaybackAzuracast", "Failed to play scheduled announcement", { hour, error: err.message });
    return false;
  }
}
