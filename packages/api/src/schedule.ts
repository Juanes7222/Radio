import type { ScheduleItem } from '@radio/types';

/**
 * Merges consecutive schedule entries that belong to the same program
 * (same title, back-to-back time slots) into a single ranged entry.
 * Keeps the first entry's metadata and exposes how many slots were merged.
 */
export function mergeConsecutiveScheduleItems(
  items: ScheduleItem[]
): ScheduleItem[] {
  const sorted = [...items].sort((a, b) => a.start_timestamp - b.start_timestamp);
  const merged: ScheduleItem[] = [];

  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.title === item.title &&
      last.end_timestamp === item.start_timestamp
    ) {
      last.end_timestamp = item.end_timestamp;
      last.end = item.end;
      last.slots = (last.slots ?? 1) + 1;
    } else {
      merged.push({ ...item, slots: 1 });
    }
  }

  return merged;
}
