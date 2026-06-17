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
 * Fetches the station schedule within the boundaries of the specified target date.
 */
async function fetchStationScheduleSafe(targetDate: Date): Promise<AzuraScheduleItem[]> {
  try {
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const { data } = await azApi.get(`/station/${STATION}/schedule`, {
      params: { 
        start: start.toISOString(), 
        end: end.toISOString() 
      }
    });
    
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    logger.warn("ScheduleAnalyzer", "Failed to fetch station schedule", { error: err.message });
    return [];
  }
}

async function fetchPlaylistsSafe(): Promise<AzuraPlaylist[]> {
  try {
    const { data } = await azApi.get<AzuraPlaylist[]>(`/station/${STATION}/playlists`);
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    logger.warn("ScheduleAnalyzer", "Failed to fetch playlists", { error: err.message });
    return [];
  }
}

/**
 * Maps standard JavaScript day index (0-6) to AzuraCast day index (1-7).
 */
function getAzuraDayOfWeek(date: Date): number {
  const day = date.getDay();
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

  const adjustedEndHour = (endMin === 0 && endHour > startHour) ? endHour - 1 : endHour;

  for (let h = startHour; h <= adjustedEndHour; h++) {
    blocked.push(h);
  }
  return blocked;
}

/**
 * Calculates occupied hours for specific Date boundaries.
 * Clamps the blocked hours to only apply to the target day, allowing midnight crossings.
 */
function calculateScheduleBlockedHours(start: Date, end: Date, targetDateString: string): number[] {
  const blocked: number[] = [];
  const startString = start.toDateString();
  const endString = end.toDateString();

  if (startString === targetDateString) {
    const isSameDay = endString === targetDateString;
    let endHour = isSameDay ? end.getHours() : 23;

    if (isSameDay && end.getMinutes() === 0 && endHour > start.getHours()) {
      endHour--;
    }

    for (let h = start.getHours(); h <= endHour; h++) {
      blocked.push(h);
    }
  } else if (endString === targetDateString) {
    let endHour = end.getHours();
    
    if (end.getMinutes() === 0 && endHour > 0) {
      endHour--;
    }

    for (let h = 0; h <= endHour; h++) {
      blocked.push(h);
    }
  }

  return blocked;
}

export async function analyzeSafeHours(date: Date = new Date()): Promise<number[]> {
  const targetDateString = date.toDateString();
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

    const blockedInterval = calculateScheduleBlockedHours(start, end, targetDateString);
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

export async function filterSafeHours(candidateHours: number[], date?: Date): Promise<number[]> {
  const safeHours = await analyzeSafeHours(date || new Date());
  return candidateHours.filter((h) => safeHours.includes(h));
}

export async function getBlockedHours(date: Date = new Date()): Promise<number[]> {
  const safeHours = await analyzeSafeHours(date);
  return Array.from({ length: 24 }, (_, i) => i).filter((h) => !safeHours.includes(h));
}