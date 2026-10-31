import { config } from "../../config";

export interface ChannelUpload {
  videoId: string;
  title: string;
  publishedAt: Date | null;
}

type JsonRecord = Record<string, unknown>;

const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESULTS = 10;

/**
 * The uploads playlist mirrors the channel id: `UCxxxx` is watched as `UUxxxx`.
 * This is the only reliable source of a channel's recent videos, because YouTube
 * retired the public Atom feed: measured on 31 Oct 2026, `/feeds/videos.xml`
 * answered 404 for a real and for an invented channel, and `/xml/feeds/videos.xml`
 * answered the same 463 byte stub for both, with no `<entry>`.
 */
export function uploadsPlaylistId(channelId: string): string {
  return `UU${channelId.slice(2)}`;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** The Data API returns titles HTML-escaped; the panel and the job list show them raw. */
function decodeTitle(title: string): string {
  return title.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

function toUpload(item: unknown): ChannelUpload | null {
  const entry = asRecord(item);
  const snippet = asRecord(entry?.snippet);
  const details = asRecord(entry?.contentDetails);
  if (!snippet || !details) return null;

  const videoId = details.videoId;
  const title = snippet.title;
  if (typeof videoId !== "string" || typeof title !== "string") return null;

  return { videoId, title: decodeTitle(title), publishedAt: toDate(snippet.publishedAt) };
}

async function explainFailure(response: Response): Promise<string> {
  try {
    const payload = asRecord(await response.json());
    const message = asRecord(payload?.error)?.message;
    if (typeof message === "string") return message;
  } catch {
    // A body that is not JSON carries nothing beyond the status code.
  }
  return `YouTube respondió ${response.status}.`;
}

/**
 * Lists the most recent uploads of a channel. An empty list is a valid answer:
 * the channel exists and has published nothing, so the panel records the count
 * instead of treating it as a failure.
 */
export async function fetchChannelUploads(channelId: string): Promise<ChannelUpload[]> {
  const apiKey = config.youtube.apiKey;
  if (!apiKey) {
    throw new Error("Falta YOUTUBE_API_KEY: la ingesta no puede consultar la Data API de YouTube.");
  }

  const url = new URL(PLAYLIST_ITEMS_URL);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", uploadsPlaylistId(channelId));
  url.searchParams.set("maxResults", String(MAX_RESULTS));
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(await explainFailure(response));
  }

  const payload = asRecord(await response.json());
  const items = payload?.items;
  if (!Array.isArray(items)) return [];

  return items
    .map(toUpload)
    .filter((upload): upload is ChannelUpload => upload !== null);
}
