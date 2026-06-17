import axios from "axios";
import { config } from "../config";
import { logger } from "../utils/logger";

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
  timeout: 10_000,
});

const STATION = config.azuracast.stationId;

interface AzuraScheduleItem {
  start_timestamp: number;
  end_timestamp: number;
  title: string;
  type: string;
  name?: string;
  is_streamer?: boolean;
}

interface AzuraPlaylist {
  id: number;
  name: string;
  type: string;
  is_enabled: boolean;
  source?: string;
  schedule_items?: Array<{
    start_time: number;
    end_time: number;
    days: number[];
  }>;
}

const BLOCKING_KEYWORDS = [
  "noticiero",
  "news",
  "noticias",
  "en vivo",
  "live",
  "streamer",
  "locutor",
  "transmisión especial",
  "evento",
  "show",
  "concierto",
  "programa especial",
  "predica",
  "rev"
];

const BLOCKING_PLAYLIST_TYPES = ["streamer", "live", "custom"];

function isBlockingItem(item: AzuraScheduleItem): boolean {
  if (item.is_streamer) return true;
  if (item.type === "streamer" || item.type === "live") return true;

  const text = `${item.title ?? ""} ${item.name ?? ""}`.toLowerCase();
  return BLOCKING_KEYWORDS.some((kw) => text.includes(kw));
}

function isBlockingPlaylist(playlist: AzuraPlaylist): boolean {
  if (!playlist.is_enabled) return false;
  if (playlist.source && playlist.source !== "songs") return true;
  if (BLOCKING_PLAYLIST_TYPES.includes(playlist.type)) return true;

  const name = (playlist.name ?? "").toLowerCase();
  return BLOCKING_KEYWORDS.some((kw) => name.includes(kw));
}

async function fetchStationScheduleSafe(): Promise<AzuraScheduleItem[]> {
  try {
    const { data } = await azApi.get(`/station/${STATION}/schedule`);
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    logger.warn("ScheduleAnalyzer", "Failed to fetch station schedule, treating as open", {
      error: err.message,
    });
    return [];
  }
}

async function fetchPlaylistsSafe(): Promise<AzuraPlaylist[]> {
  try {
    const { data } = await azApi.get<AzuraPlaylist[]>(`/station/${STATION}/playlists`);
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    logger.warn("ScheduleAnalyzer", "Failed to fetch playlists, treating as open", {
      error: err.message,
    });
    return [];
  }
}

/**
 * Returns the hours that are BLOCKED for inserting time announcements.
 * Only blocks hours with special programming (news, live shows, events).
 * Regular music programming does NOT block announcements since they are
 * injected into the play queue between songs.
 *
 * If the AzuraCast API is unreachable, returns an empty set (fail open)
 * so the radio can still announce the hour.
 */
export async function analyzeSafeHours(date: Date = new Date()): Promise<number[]> {
  const [schedule, playlists] = await Promise.all([
    fetchStationScheduleSafe(),
    fetchPlaylistsSafe(),
  ]);

  const dayOfWeek = date.getDay();
  const blockedHours = new Set<number>();

  for (const item of schedule) {
    if (!isBlockingItem(item)) continue;

    const start = new Date(item.start_timestamp * 1000);
    const end = new Date(item.end_timestamp * 1000);

    if (start.toDateString() !== date.toDateString()) continue;

    const startHour = start.getHours();
    const endHour = end.getHours();
    const startMin = start.getMinutes();

    if (startMin > 30 && startHour === endHour) {
      blockedHours.add(startHour);
    } else {
      for (let h = startHour; h <= endHour; h++) {
        blockedHours.add(h);
      }
    }
  }

  for (const playlist of playlists) {
    if (!isBlockingPlaylist(playlist)) continue;
    if (!playlist.schedule_items) continue;

    for (const item of playlist.schedule_items) {
      if (!item.days.includes(dayOfWeek)) continue;

      const startHour = Math.floor(item.start_time / 100);
      const endHour = Math.floor(item.end_time / 100);

      for (let h = startHour; h <= endHour; h++) {
        blockedHours.add(h);
      }
    }
  }

  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const safeHours = allHours.filter((h) => !blockedHours.has(h));

  logger.info("ScheduleAnalyzer", "Safe hours computed", {
    blockedHours: Array.from(blockedHours),
    safeHoursCount: safeHours.length,
  });

  return safeHours;
}

/**
 * Filters a list of candidate hours to only those that are safe
 * according to the current station schedule.
 */
export async function filterSafeHours(
  candidateHours: number[],
  date?: Date
): Promise<number[]> {
  const safeHours = await analyzeSafeHours(date || new Date());
  return candidateHours.filter((h) => safeHours.includes(h));
}

/**
 * Returns hours that are explicitly blocked by programming.
 */
export async function getBlockedHours(date: Date = new Date()): Promise<number[]> {
  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const safeHours = await analyzeSafeHours(date);
  return allHours.filter((h) => !safeHours.includes(h));
}
