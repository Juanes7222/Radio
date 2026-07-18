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


