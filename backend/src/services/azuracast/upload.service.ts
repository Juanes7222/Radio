import fs from "fs";
import fetch from "node-fetch";
import { config } from "../../config";
import { logger } from "../../utils/logger";

export interface AzuracastUploadResult {
  fileId: string;
  azuraPath: string;
}

export async function uploadMp3ToAzuracast(
  localPath: string,
  title: string,
  playlistId?: string,
  folder?: string
): Promise<AzuracastUploadResult> {
  logger.info("AzuracastService", "Raw title received", {
    title,
    bytes: Buffer.from(title).toString("hex"),
  });

  const { url, apiKey, stationId } = config.azuracast;
  const sanitizedTitle = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 200);
  const filename = sanitizedTitle.length > 0 ? `${sanitizedTitle}.mp3` : `audio_${Date.now()}.mp3`;
  const destinationPath = folder ? `${folder}/${filename}` : filename;

  const fileBuffer = fs.readFileSync(localPath);
  const base64 = fileBuffer.toString("base64");

  const uploadUrl = `${url}/api/station/${stationId}/files`;

  logger.info("AzuracastService", "Uploading file", { filename, azuraPath: destinationPath, title });

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: destinationPath,
      file: `data:audio/mpeg;base64,${base64}`,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    throw new Error(`AzuraCast upload failed [${uploadResponse.status}]: ${body}`);
  }

  const data = (await uploadResponse.json()) as { id: string; path: string };
  const fileId = String(data.id);
  const azuraPath = data.path;

  if (playlistId) {
    logger.info("AzuracastService", "Assigning file to playlist", { fileId, playlistId });
    await assignToPlaylist(fileId, playlistId, stationId, url, apiKey);
  }

  logger.info("AzuracastService", "Upload complete", { fileId, azuraPath });
  return { fileId, azuraPath };
}

async function assignToPlaylist(
  fileId: string,
  playlistId: string,
  stationId: string,
  baseUrl: string,
  apiKey: string
): Promise<void> {
  const url = `${baseUrl}/api/station/${stationId}/file/${fileId}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ playlists: [{ id: playlistId }] }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    logger.warn("AzuracastService", "Could not assign to playlist", { fileId, playlistId });
  } else {
    logger.info("AzuracastService", "File assigned to playlist", { fileId, playlistId });
  }
}