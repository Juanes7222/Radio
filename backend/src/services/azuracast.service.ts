import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { config } from '../config';

const azApi = axios.create({
  baseURL: `\${config.azuracast.url}/api`,
  headers: { 'X-API-Key': config.azuracast.apiKey }
});

const STATION = config.azuracast.stationId;

export async function uploadMedia(filePath: string, remotePath: string): Promise<string> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('path', remotePath);

  const { data } = await azApi.post(`/station/\${STATION}/files`, form, {
    headers: form.getHeaders?.() || { 'Content-Type': 'multipart/form-data' }
  });
  return data.id;
}

export async function upsertScheduledPlaylist(name: string, cronHour: number): Promise<string> {
  const { data: playlists } = await azApi.get(`/station/\${STATION}/playlists`);
  let playlist = playlists.find((p: any) => p.name === name);

  if (!playlist) {
    const { data } = await azApi.post(`/station/\${STATION}/playlists`, {
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
  await azApi.post(`/station/\${STATION}/queue/inject_from_playlist`, {
    media_id: mediaId
  });
}
