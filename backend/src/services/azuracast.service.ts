import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { config } from '../config';

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { 'X-API-Key': config.azuracast.apiKey }
});

const STATION = config.azuracast.stationId;

export async function uploadMedia(filePath: string, remotePath: string): Promise<string> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('path', remotePath);

  try {
    const { data } = await azApi.post(`/station/${STATION}/files`, form, {
      headers: form.getHeaders?.() || { 'Content-Type': 'multipart/form-data' },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return data.id;
  } catch (err: any) {
    const responseData = err.response?.data;
    const responseStatus = err.response?.status;
    const errorMessage =
      typeof responseData === "string"
        ? responseData
        : responseData?.message || JSON.stringify(responseData) || err.message;

    const error: any = new Error(
      `AzuraCast upload failed (${responseStatus || "?"}): ${errorMessage}`
    );
    error.status = responseStatus;
    error.response = err.response;
    throw error;
  }
}

export async function upsertScheduledPlaylist(name: string, cronHour: number): Promise<string> {
  const { data: playlists } = await azApi.get(`/station/${STATION}/playlists`);
  let playlist = playlists.find((p: any) => p.name === name);

  if (!playlist) {
    const { data } = await azApi.post(`/station/${STATION}/playlists`, {
      name,
      type: 'scheduled',
      is_enabled: true,
      weight: 3,
      schedule_items: [{
        start_time: cronHour * 100,
        end_time: cronHour * 100 + 2,
        days: [0, 1, 2, 3, 4, 5, 6]
      }]
    });
    playlist = data;
  }

  return playlist.id;
}

export async function forcePlayAnnouncement(mediaId: string): Promise<void> {
  try {
    await azApi.post(`/station/${STATION}/queue`, {
      media_id: mediaId,
    });
  } catch (err: any) {
    const responseData = err.response?.data;
    const responseStatus = err.response?.status;
    const errorMessage =
      typeof responseData === "string"
        ? responseData
        : responseData?.message || JSON.stringify(responseData) || err.message;
    throw new Error(
      `AzuraCast queue inject failed (${responseStatus || "?"}): ${errorMessage}`
    );
  }
}

interface PlaylistResponse {
  id: number;
  name: string;
  type: string;
  is_enabled: boolean;
  media_items?: Array<{ media: { id: number; unique_id: string } }>;
}

export async function getOrCreatePlaylist(name: string): Promise<string> {
  try {
    const { data: playlists } = await azApi.get<PlaylistResponse[]>(`/station/${STATION}/playlists`);
    const existing = playlists.find((p) => p.name === name);
    if (existing) {
      return String(existing.id);
    }
  } catch (err) {
    // Playlist may not exist, create below
  }

  const { data } = await azApi.post(`/station/${STATION}/playlists`, {
    name,
    type: 'default',
    is_enabled: true,
    weight: 5,
  });

  return String(data.id);
}

export async function addMediaToPlaylist(playlistId: string, mediaId: string): Promise<void> {
  await azApi.put(`/station/${STATION}/file/${mediaId}`, {
    playlists: [{ id: parseInt(playlistId, 10) }],
  });
}

export async function removeMediaFromPlaylist(playlistId: string, mediaId: string): Promise<void> {
  await azApi.put(`/station/${STATION}/file/${mediaId}`, {
    playlists: [],
  });
}

export async function getPlaylistMedia(playlistId: string): Promise<string[]> {
  const { data } = await azApi.get<PlaylistResponse>(`/station/${STATION}/playlist/${playlistId}`);
  if (!data.media_items) return [];
  return data.media_items.map((item) => String(item.media.id));
}
