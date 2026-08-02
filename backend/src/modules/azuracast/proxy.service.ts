import axios, { type AxiosError, type AxiosRequestConfig, type Method } from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import {
  AZURACAST_REQUEST_TIMEOUT_MS,
  SONG_REQUESTS_CACHE_TTL_MS,
  SONG_REQUESTS_PAGE_SIZE,
} from "../../shared/constants";
import { normalizeSearch } from "../../shared/utils/sanitize";

/**
 * Minimal HTTP request shape used to forward calls to AzuraCast.
 * Keeps the proxy logic independent from the Express Request object.
 */
export interface ProxyRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body?: unknown;
}

export interface ProxyResult {
  status: number;
  data: unknown;
}

export interface SongRequest {
  request_id: string;
  song: {
    title: string;
    artist: string;
    art?: string;
  };
}

let requestsCache: {
  data: SongRequest[];
  expiresAt: number;
} | null = null;

/** True when the connection to AzuraCast itself failed. */
export function isConnectionError(err: unknown): boolean {
  const code = (err as AxiosError)?.code;
  return code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ENOTFOUND";
}

/** Replaces internal AzuraCast URLs with the externally reachable ones. */
export function rewriteInternalUrls(data: unknown, publicUrl: string): unknown {
  const azuraUrl = config.azuracast.url;

  let rewritten = JSON.stringify(data)
    .replace(/https?:\/\/localhost(:\d+)?/g, publicUrl)
    .replace(/https?:\/\/127\.0\.0\.1(:\d+)?/g, publicUrl);

  try {
    const parsedAzura = new URL(azuraUrl);
    const azuraHost = `${parsedAzura.protocol}//${parsedAzura.host}`;

    rewritten = rewritten.replaceAll(`${azuraHost}/api/`, `${publicUrl}/api/`);

    if (azuraHost.includes("panel.")) {
      const publicDomain = azuraHost.replace("panel.", "www.");
      rewritten = rewritten.replaceAll(`${azuraHost}/listen/`, `${publicDomain}/listen/`);
      rewritten = rewritten.replaceAll(`${azuraHost}/public/`, `${publicDomain}/public/`);
      rewritten = rewritten.replaceAll(`${azuraHost}/static/`, `${publicDomain}/static/`);
      rewritten = rewritten.replaceAll(
        `${azuraHost}/api/station/la_voz_de_la_verdad/art/`,
        `${publicDomain}/api/station/la_voz_de_la_verdad/art/`
      );
    }
  } catch {
    rewritten = rewritten.replaceAll(`${azuraUrl}/api/`, `${publicUrl}/api/`);
  }

  return JSON.parse(rewritten);
}

/** Extracts the song request list from a payload that may wrap it. */
export function extractSongRequests(payload: unknown): SongRequest[] {
  if (Array.isArray(payload)) {
    return payload as SongRequest[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const obj = payload as Record<string, unknown>;

  const candidates = [obj.rows, obj.result, obj.data, obj.items, obj.results, obj.records];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as SongRequest[];
    }
  }

  if (obj.data && typeof obj.data === "object") {
    const nested = obj.data as Record<string, unknown>;
    const nestedCandidates = [obj.rows, obj.result, nested.data, nested.items, nested.results, nested.records];

    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate)) {
        return candidate as SongRequest[];
      }
    }
  }

  return [];
}

/**
 * Forwards an incoming request to AzuraCast, applying an optional transform
 * to the response body. Extracts Basic Auth credentials from the URL when present.
 */
export async function fetchFromAzuraCast(
  req: ProxyRequest,
  azuracastPath: string,
  transform?: (data: unknown) => unknown | Promise<unknown>,
  customParams?: Record<string, unknown>
): Promise<ProxyResult> {
  const axiosConfig: AxiosRequestConfig = {
    method: req.method as Method,
    url: `${config.azuracast.url}${azuracastPath}`,
    headers: {
      Authorization: `Bearer ${config.azuracast.apiKey}`,
      "Content-Type": req.headers["content-type"] ?? "application/json",
    },
    params: { ...req.query, ...customParams },
    timeout: AZURACAST_REQUEST_TIMEOUT_MS,
  };

  try {
    const urlObj = new URL(axiosConfig.url!);
    if (urlObj.username && urlObj.password) {
      axiosConfig.auth = {
        username: urlObj.username,
        password: urlObj.password,
      };
      urlObj.username = "";
      urlObj.password = "";
      axiosConfig.url = urlObj.toString();
    }
  } catch {
    // Malformed URL: proceed without auth extraction
  }

  if (["POST", "PUT", "PATCH"].includes(req.method) && req.body && Object.keys(req.body).length) {
    axiosConfig.data = req.body;
  }

  const response = await axios(axiosConfig);
  const body = transform ? await transform(response.data) : response.data;
  return { status: response.status, data: body };
}

/**
 * Fetches all requestable songs for the station, paginating until the
 * last page. Results are cached for a short period to protect AzuraCast.
 */
export async function getAllRequestableSongs(req: ProxyRequest, publicUrl: string): Promise<SongRequest[]> {
  if (requestsCache && requestsCache.expiresAt > Date.now()) {
    return requestsCache.data;
  }

  const allSongs: SongRequest[] = [];
  let page = 1;

  while (true) {
    const { data } = await fetchFromAzuraCast(
      req,
      `/api/station/${config.azuracast.stationId}/requests`,
      (d) => rewriteInternalUrls(d, publicUrl),
      { page, per_page: SONG_REQUESTS_PAGE_SIZE }
    );

    const batch = extractSongRequests(data);
    allSongs.push(...batch);

    if (batch.length < SONG_REQUESTS_PAGE_SIZE) {
      break;
    }

    page++;
  }

  const uniqueSongs = Array.from(new Map(allSongs.map((song) => [song.request_id, song])).values());

  requestsCache = {
    data: uniqueSongs,
    expiresAt: Date.now() + SONG_REQUESTS_CACHE_TTL_MS,
  };

  logger.info("AzuraProxy", "Refreshed song requests cache", { count: uniqueSongs.length });
  return uniqueSongs;
}

/** Filters and paginates the cached song list by a normalized search term. */
export function searchRequestableSongs(songs: SongRequest[], search: string, page: number, perPage: number): SongRequest[] {
  const filteredSongs = !search
    ? songs
    : songs.filter((item) => {
        const haystack = normalizeSearch([item.song?.title ?? "", item.song?.artist ?? ""].join(" "));
        return haystack.includes(search);
      });

  const start = (page - 1) * perPage;
  const end = start + perPage;
  return filteredSongs.slice(start, end);
}
