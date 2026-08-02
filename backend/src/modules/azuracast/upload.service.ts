import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import {
  AZURACAST_SHORT_TIMEOUT_MS,
  AZURACAST_UPLOAD_TIMEOUT_MS,
  RECENT_FILES_LIMIT,
} from "../../shared/constants";

export interface UploadedFile {
  id: number;
  unique_id: string;
  path: string;
}

/**
 * Uploads a file (base64 payload) to the station media library and
 * optionally assigns it to a playlist. Playlist assignment is best-effort.
 */
export async function uploadFileToStation(
  uploadPath: string,
  base64File: string,
  playlistId?: string
): Promise<UploadedFile> {
  const uploadRes = await axios.post(
    `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files`,
    { path: uploadPath, file: base64File },
    {
      headers: {
        Authorization: `Bearer ${config.azuracast.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: AZURACAST_UPLOAD_TIMEOUT_MS,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  const fileData = uploadRes.data as UploadedFile;

  if (playlistId && fileData.id) {
    try {
      await axios.put(
        `${config.azuracast.url}/api/station/${config.azuracast.stationId}/file/${fileData.id}`,
        { playlists: [{ id: parseInt(playlistId, 10) }] },
        {
          headers: {
            Authorization: `Bearer ${config.azuracast.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: AZURACAST_SHORT_TIMEOUT_MS,
        }
      );
    } catch (playlistErr) {
      logger.warn("UploadService", "Could not assign playlist", {
        error: playlistErr instanceof Error ? playlistErr.message : String(playlistErr),
      });
    }
  }

  return fileData;
}

export async function getRecentFiles(): Promise<unknown> {
  const response = await axios.get(
    `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files`,
    {
      headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
      params: { per_page: RECENT_FILES_LIMIT, page: 1 },
      timeout: 15_000,
    }
  );
  return response.data;
}

/** Orders AzuraCast to reprocess the media library. */
export async function triggerMediaRescan(): Promise<void> {
  await axios.put(
    `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files/batch`,
    { files: [], action: "reprocess" },
    {
      headers: {
        Authorization: `Bearer ${config.azuracast.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    }
  );
}

export async function deleteStationFile(fileId: string): Promise<void> {
  await axios.delete(
    `${config.azuracast.url}/api/station/${config.azuracast.stationId}/file/${fileId}`,
    {
      headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
      timeout: AZURACAST_SHORT_TIMEOUT_MS,
    }
  );
}
