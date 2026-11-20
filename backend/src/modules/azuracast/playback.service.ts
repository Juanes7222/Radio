import { azuracastApi, STATION_ID } from "./azuracast.client";
import { logger } from "../../shared/logger/logger";
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
