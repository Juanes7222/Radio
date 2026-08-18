import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScheduleItem, ScheduleCategorySummary } from '@radio/types';

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