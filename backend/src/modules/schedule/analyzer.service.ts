import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationDayStart, getStationTime } from "../../shared/utils/date";
import { STATION_ID } from "../azuracast/azuracast.client";

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
  timeout: 10_000,
});

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
  "rev",
];

const BLOCKING_PLAYLIST_TYPES = ["streamer", "live", "custom"];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isBlockingItem(item: AzuraScheduleItem): boolean {
  if (item.is_streamer || BLOCKING_PLAYLIST_TYPES.includes(item.type)) {
    return true;
  }

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

/**
 * Fetches the station schedule inside the station calendar day that contains
 * the target date. Boundaries are station time, not host time.
 */
async function fetchStationScheduleSafe(targetDate: Date): Promise<AzuraScheduleItem[]> {
  try {
    const start = getStationDayStart(targetDate);
    const end = new Date(start.getTime() + DAY_IN_MS - 1);

    const { data } = await azApi.get(`/station/${STATION_ID}/schedule`, {
      params: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });

    return Array.isArray(data) ? data : [];
  } catch (err) {
    logger.warn("ScheduleAnalyzer", "Failed to fetch station schedule", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function fetchPlaylistsSafe(): Promise<AzuraPlaylist[]> {
  try {
    const { data } = await azApi.get<AzuraPlaylist[]>(`/station/${STATION_ID}/playlists`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    logger.warn("ScheduleAnalyzer", "Failed to fetch playlists", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Maps the station day index (0-6, Sunday first) to the AzuraCast day
 * index used by playlist schedules (1-7, Monday first).
 */
function getAzuraDayOfWeek(date: Date): number {
  const day = getStationTime(date).dayIndex;
  return day === 0 ? 7 : day;
}

/**
 * Calculates occupied hours handling strict time boundaries.
 * Prevents blocking the final hour if the event ends exactly at minute zero.
 */
function calculatePlaylistBlockedHours(startTime: number, endTime: number): number[] {
  const blocked: number[] = [];
  const startHour = Math.floor(startTime / 100);
  const endHour = Math.floor(endTime / 100);
  const endMin = endTime % 100;

  const adjustedEndHour = endMin === 0 && endHour > startHour ? endHour - 1 : endHour;

  for (let h = startHour; h <= adjustedEndHour; h++) {
    blocked.push(h);
  }
  return blocked;
}

/**
 * Calculates occupied hours for specific Date boundaries.
 * Clamps the blocked hours to only apply to the target day, allowing midnight crossings.
 */
function calculateScheduleBlockedHours(
  start: Date,
  end: Date,
  targetDayKey: string
): number[] {
  const startTime = getStationTime(start);
  const endTime = getStationTime(end);
  const blocked: number[] = [];

  if (startTime.dayKey === targetDayKey) {
    const isSameDay = endTime.dayKey === targetDayKey;
    let endHour = isSameDay ? endTime.hour : 23;

    if (isSameDay && endTime.minute === 0 && endHour > startTime.hour) {
      endHour--;
    }

    for (let h = startTime.hour; h <= endHour; h++) {
      blocked.push(h);
    }
  } else if (endTime.dayKey === targetDayKey) {
    let endHour = endTime.hour;

    if (endTime.minute === 0 && endHour > 0) {
      endHour--;
    }

    for (let h = 0; h <= endHour; h++) {
      blocked.push(h);
    }
  }

  return blocked;
}

export async function analyzeSafeHours(date: Date = new Date()): Promise<number[]> {
  const targetDayKey = getStationTime(date).dayKey;
  const [schedule, playlists] = await Promise.all([
    fetchStationScheduleSafe(date),
    fetchPlaylistsSafe(),
  ]);

  const blockedHours = new Set<number>();
  const currentAzuraDay = getAzuraDayOfWeek(date);

  for (const item of schedule) {
    if (!isBlockingItem(item)) continue;

    const start = new Date(item.start_timestamp * 1000);
    const end = new Date(item.end_timestamp * 1000);

    const blockedInterval = calculateScheduleBlockedHours(start, end, targetDayKey);
    blockedInterval.forEach((hour) => blockedHours.add(hour));
  }

  for (const playlist of playlists) {
    if (!isBlockingPlaylist(playlist) || !playlist.schedule_items) continue;

    for (const item of playlist.schedule_items) {
      if (!item.days.includes(currentAzuraDay)) continue;

      const blockedInterval = calculatePlaylistBlockedHours(item.start_time, item.end_time);
      blockedInterval.forEach((hour) => blockedHours.add(hour));
    }
  }

  const safeHours = Array.from({ length: 24 }, (_, i) => i).filter((h) => !blockedHours.has(h));

  logger.info("ScheduleAnalyzer", "Safe hours computed", {
    blockedHours: Array.from(blockedHours).sort((a, b) => a - b),
    safeHoursCount: safeHours.length,
  });

  return safeHours;
}

export async function filterSafeHours(
  candidateHours: number[],
  date?: Date
): Promise<number[]> {
  const safeHours = await analyzeSafeHours(date || new Date());
  return candidateHours.filter((h) => safeHours.includes(h));
}

export async function getBlockedHours(date: Date = new Date()): Promise<number[]> {
  const safeHours = await analyzeSafeHours(date);
  return Array.from({ length: 24 }, (_, i) => i).filter((h) => !safeHours.includes(h));
}
