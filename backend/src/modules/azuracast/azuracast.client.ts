import axios from "axios";
import { config } from "../../config";

/**
 * Shared AzuraCast API client. All station traffic flows through it.
 */
export const azuracastApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
});

export const STATION_ID = config.azuracast.stationId;
