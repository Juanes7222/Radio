import axios from "axios";
import { config } from "../config";
import { logger } from "../utils/logger";

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
});

const STATION = config.azuracast.stationId;

interface ScheduledItem {
  startHour: number;
  endHour: number;
  title: string;
  type: "playlist" | "streamer" | "remote";
}

interface AzuraPlaylist {
  id: number;
  name: string;
  type: string;
  is_enabled: boolean;
  schedule_items?: Array<{
    start_time: number;
    end_time: number;
    days: number[];
  }>;
}

interface AzuraSchedule {
  start_timestamp: number;
  end_timestamp: number;
  title: string;
  type: string;
}

/**
 * Fetches the current schedule for the station from AzuraCast.
 */
export async function fetchStationSchedule(): Promise<AzuraSchedule[]> {
  try {
    const { data } = await azApi.get(`/station/${STATION}/schedule`, {
      timeout: 15_000,
    });
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    logger.error("ScheduleAnalyzer", "Failed to fetch station schedule", {
      error: err.message,
    });
    return [];
  }
}

/**
 * Analyzes the station schedule and returns hours that are safe
 * for inserting time announcements without interfering with other programming.
 *
 * A safe hour is one where:
 * - There is no scheduled playlist overlapping the top of the hour
 * - There is no live streamer scheduled
 * - The hour is not within a "remote" source block
 */
export async function analyzeSafeHours(date: Date = new Date()): Promise<number[]> {
  const schedule = await fetchStationSchedule();
  const dayOfWeek = date.getDay();

  const busyHours = new Set<number>();

  for (const item of schedule) {
    const start = new Date(item.start_timestamp * 1000);
    const end = new Date(item.end_timestamp * 1000);

    // Only consider items that overlap the target day
    if (start.toDateString() !== date.toDateString()) {
      continue;
    }

    const startHour = start.getHours();
    const endHour = end.getHours();

    for (let h = startHour; h <= endHour; h++) {
      busyHours.add(h);
    }
  }

  // Also fetch playlists to cross-reference
  try {
    const { data: playlists } = await azApi.get<AzuraPlaylist[]>(
      `/station/${STATION}/playlists`,
      { timeout: 15_000 }
    );

    for (const playlist of playlists) {
      if (!playlist.is_enabled || !playlist.schedule_items) continue;

      for (const item of playlist.schedule_items) {
        if (!item.days.includes(dayOfWeek)) continue;

        const startHour = Math.floor(item.start_time / 100);
        const endHour = Math.floor(item.end_time / 100);

        for (let h = startHour; h <= endHour; h++) {
          busyHours.add(h);
        }
      }
    }
  } catch (err: any) {
    logger.warn("ScheduleAnalyzer", "Could not fetch playlists for schedule analysis", {
      error: err.message,
    });
  }

  const allHours = Array.from({ length: 24 }, (_, i) => i);
  return allHours.filter((h) => !busyHours.has(h));
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
 * Returns hours that are explicitly blocked by programming
 * (e.g., news, live shows, special events).
 */
export async function getBlockedHours(date: Date = new Date()): Promise<number[]> {
  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const safeHours = await analyzeSafeHours(date);
  return allHours.filter((h) => !safeHours.includes(h));
}
