/**
 * Pure calculations for the usage telemetry: the daily active series and the
 * retention cohorts. They work on the rows the service already loaded, so they
 * can be tested without a database or the station settings cache.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface ActivityEntry {
  readonly deviceId: string;
  readonly day: string;
}

export interface DailyActivePoint {
  readonly day: string;
  readonly devices: number;
}

export interface RetentionRate {
  /** Devices old enough to have reached this day. */
  readonly eligible: number;
  /** Devices that came back exactly on this day. */
  readonly retained: number;
  /** Percentage with one decimal, or null when nobody was eligible yet. */
  readonly rate: number | null;
}

export interface RetentionReport {
  readonly cohort: number;
  readonly d1: RetentionRate;
  readonly d7: RetentionRate;
  readonly d30: RetentionRate;
}

const RETENTION_OFFSETS = [1, 7, 30] as const;

/** Day index of a YYYY-MM-DD key, or null when it is not a real date. */
export function dayIndex(day: string): number | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const utc = Date.UTC(year, month - 1, date);
  const parsed = new Date(utc);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== date
  ) {
    return null;
  }

  return Math.floor(utc / MS_PER_DAY);
}

/** YYYY-MM-DD key of a day index produced by dayIndex. */
export function dayKeyFromIndex(index: number): string {
  return new Date(index * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Devices that opened the app on each day of the window, including the days
 * with no activity so the series can be charted without gaps.
 */
export function buildDailyActive(
  entries: readonly ActivityEntry[],
  days: number,
  lastDay: string
): DailyActivePoint[] {
  const lastIndex = dayIndex(lastDay);
  if (lastIndex === null) throw new Error(`Invalid last day: ${lastDay}`);

  const firstIndex = lastIndex - (days - 1);
  const devicesByDay = new Map<number, Set<string>>();

  for (const entry of entries) {
    const index = dayIndex(entry.day);
    if (index === null || index < firstIndex || index > lastIndex) continue;

    const devices = devicesByDay.get(index) ?? new Set<string>();
    devices.add(entry.deviceId);
    devicesByDay.set(index, devices);
  }

  const points: DailyActivePoint[] = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    points.push({
      day: dayKeyFromIndex(index),
      devices: devicesByDay.get(index)?.size ?? 0,
    });
  }

  return points;
}

/**
 * Retention of the devices whose first activity falls inside the loaded rows.
 * A device only enters the denominator of `dN` once its first day is at least
 * N days old, so a cohort created yesterday never reports a misleading zero.
 */
export function computeRetention(
  entries: readonly ActivityEntry[],
  lastDay: string
): RetentionReport {
  const lastIndex = dayIndex(lastDay);
  if (lastIndex === null) throw new Error(`Invalid last day: ${lastDay}`);

  const daysByDevice = new Map<string, Set<number>>();
  for (const entry of entries) {
    const index = dayIndex(entry.day);
    if (index === null) continue;

    const days = daysByDevice.get(entry.deviceId) ?? new Set<number>();
    days.add(index);
    daysByDevice.set(entry.deviceId, days);
  }

  const counters = new Map<number, { eligible: number; retained: number }>();
  for (const offset of RETENTION_OFFSETS) {
    counters.set(offset, { eligible: 0, retained: 0 });
  }

  for (const days of daysByDevice.values()) {
    const firstDay = Math.min(...days);

    for (const offset of RETENTION_OFFSETS) {
      if (firstDay + offset > lastIndex) continue;

      const counter = counters.get(offset);
      if (!counter) continue;

      counter.eligible += 1;
      if (days.has(firstDay + offset)) counter.retained += 1;
    }
  }

  const toRate = (offset: number): RetentionRate => {
    const counter = counters.get(offset) ?? { eligible: 0, retained: 0 };
    return {
      eligible: counter.eligible,
      retained: counter.retained,
      rate:
        counter.eligible === 0
          ? null
          : Math.round((counter.retained / counter.eligible) * 1000) / 10,
    };
  };

  return {
    cohort: daysByDevice.size,
    d1: toRate(1),
    d7: toRate(7),
    d30: toRate(30),
  };
}
