/**
 * Pure helpers for the app telemetry. They stay free of React Native imports so
 * the rules that decide when something is reported can be tested in Node.
 */
import { STATION_UTC_OFFSET_HOURS } from '../constants/api';

const MS_PER_HOUR = 3_600_000;
const MAX_ERRORS_PER_SESSION = 10;

/** Station calendar day of an instant, as YYYY-MM-DD. */
export function stationDay(now: Date): string {
  return new Date(now.getTime() + STATION_UTC_OFFSET_HOURS * MS_PER_HOUR)
    .toISOString()
    .slice(0, 10);
}

/**
 * A daily open is enough to measure retention, so a second cold start on the
 * same station day must not double-count the device.
 */
export function shouldReportOpen(lastReportedDay: string | null, today: string): boolean {
  return lastReportedDay !== today;
}

/**
 * Key used to avoid reporting the same failure several times in one session.
 * The backend groups by a stronger fingerprint; this one only has to be stable
 * within the process.
 */
export function errorDedupeKey(message: string, stack: string | null): string {
  const firstFrame =
    stack?.split('\n').find((line) => line.trim().startsWith('at '))?.trim() ?? '';

  return `${message.trim()}|${firstFrame}`;
}

/**
 * Returns a predicate that accepts each key once and stops after `limit`.
 * Without the cap a render loop would turn one bug into hundreds of writes.
 */
export function createSessionDeduper(
  limit: number = MAX_ERRORS_PER_SESSION,
): (key: string) => boolean {
  const seen = new Set<string>();

  return (key: string): boolean => {
    if (seen.has(key)) return false;
    if (seen.size >= limit) return false;

    seen.add(key);
    return true;
  };
}
