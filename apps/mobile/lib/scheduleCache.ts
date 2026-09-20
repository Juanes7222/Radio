import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchSchedule, fetchScheduleCategories } from '@radio/api';
import type { ScheduleItem, ScheduleCategorySummary } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';

export const SCHEDULE_CACHE_KEY = 'schedule_cache_v1';
export const SCHEDULE_CACHE_TTL_MS = 1000 * 60 * 30;

export interface ScheduleCache {
  schedule: ScheduleItem[];
  categories: ScheduleCategorySummary[];
  timestamp: number;
}

export async function readScheduleCache(): Promise<ScheduleCache | null> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScheduleCache;
    if (!Array.isArray(parsed.schedule) || !Array.isArray(parsed.categories)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeScheduleCache(cache: ScheduleCache): Promise<void> {
  try {
    await AsyncStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures
  }
}

/**
 * The station schedule for the current week, cache first: a cached copy is
 * returned immediately and a stale one is refreshed in the background, so
 * callers never block on the network and the next caller gets fresh data.
 * Without a cache the schedule is awaited once, and `null` is returned when
 * the network is also unavailable.
 */
export async function loadScheduleWithCache(): Promise<ScheduleItem[] | null> {
  const cached = await readScheduleCache();
  const isFresh = cached !== null && Date.now() - cached.timestamp < SCHEDULE_CACHE_TTL_MS;

  if (cached && !isFresh) {
    void refreshScheduleCache();
  }

  if (cached) return cached.schedule;
  return refreshScheduleCache();
}

async function refreshScheduleCache(): Promise<ScheduleItem[] | null> {
  try {
    const [schedule, categories] = await Promise.all([
      fetchSchedule(BACKEND_URL),
      fetchScheduleCategories(BACKEND_URL),
    ]);
    if (!schedule || !categories) return schedule;

    await writeScheduleCache({ schedule, categories, timestamp: Date.now() });
    return schedule;
  } catch {
    return null;
  }
}