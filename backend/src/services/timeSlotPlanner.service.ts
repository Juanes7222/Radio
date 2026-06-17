import { prisma } from "../lib/prisma";

export type TimeSlotGroup = "morning" | "afternoon" | "evening" | "night";

interface TimeSlot {
  hour: number;
  group: TimeSlotGroup;
}

interface PlannerResult {
  date: Date;
  hour: number;
  group: TimeSlotGroup;
  audioId?: string;
  needsGeneration: boolean;
}

const GROUP_HOURS: Record<TimeSlotGroup, number[]> = {
  morning: [6, 7, 8, 9, 10, 11],
  afternoon: [12, 13, 14, 15, 16, 17],
  evening: [18, 19, 20, 21],
  night: [22, 23, 0, 1, 2, 3, 4, 5],
};

function getGroupForHour(hour: number): TimeSlotGroup {
  if (hour >= 6 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  if (hour >= 18 && hour <= 21) return "evening";
  return "night";
}

function getNextDays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Selects which hours to cover for a given day, rotating the selection
 * to avoid always using the same hours and accumulating too many files.
 */
function selectHoursForDay(date: Date, slotsPerGroup: number): number[] {
  const dayOfYear = getDayOfYear(date);
  const selected: number[] = [];

  for (const [group, hours] of Object.entries(GROUP_HOURS)) {
    const offset = (dayOfYear + group.length) % Math.max(1, hours.length - slotsPerGroup + 1);
    const start = offset % hours.length;

    for (let i = 0; i < slotsPerGroup && i < hours.length; i++) {
      const idx = (start + i) % hours.length;
      selected.push(hours[idx]);
    }
  }

  return selected.sort((a, b) => a - b);
}

/**
 * Finds a reusable audio for the given hour and date.
 * Rules:
 * - Audio must be for the same hour value
 * - Audio must not have been used on the previous calendar day at the same hour
 * - Audio must be in 'ready' status
 * - Prefer audios with lower useCount (rotation)
 */
async function findReusableAudio(
  hour: number,
  date: Date
): Promise<string | undefined> {
  const previousDate = new Date(date);
  previousDate.setDate(previousDate.getDate() - 1);

  const candidates = await prisma.generatedAudio.findMany({
    where: {
      hourValue: hour,
      status: "ready",
      OR: [
        { lastUsedDate: { lt: previousDate } },
        { lastUsedDate: null },
      ],
    },
    orderBy: [{ useCount: "asc" }, { generatedAt: "desc" }],
    take: 5,
  });

  if (candidates.length === 0) {
    return undefined;
  }

  // Pick the least recently used
  return candidates[0].id;
}

export interface PlanningOptions {
  daysAhead: number;
  slotsPerGroup: number;
  targetDate?: Date;
}

/**
 * Generates a plan for upcoming time announcements.
 * Returns which hours need coverage and whether each requires
 * generating a new audio or can reuse an existing one.
 */
export async function generatePlan(
  options: PlanningOptions = { daysAhead: 1, slotsPerGroup: 2 }
): Promise<PlannerResult[]> {
  const days = options.targetDate
    ? [options.targetDate]
    : getNextDays(options.daysAhead);

  const results: PlannerResult[] = [];

  for (const day of days) {
    const hours = selectHoursForDay(day, options.slotsPerGroup);

    for (const hour of hours) {
      const group = getGroupForHour(hour);
      const existingSchedule = await prisma.audioSchedule.findFirst({
        where: {
          scheduledDate: day,
          scheduledHour: hour,
          enabled: true,
        },
      });

      if (existingSchedule) {
        continue;
      }

      const reusableAudioId = await findReusableAudio(hour, day);

      results.push({
        date: day,
        hour,
        group,
        audioId: reusableAudioId,
        needsGeneration: !reusableAudioId,
      });
    }
  }

  return results;
}

/**
 * Returns statistics about how many audios exist per group and hour.
 */
export async function getAudioStats(): Promise<{
  total: number;
  byGroup: Record<TimeSlotGroup, number>;
  byHour: Record<number, number>;
}> {
  const all = await prisma.generatedAudio.findMany({
    where: { status: "ready" },
  });

  const byGroup: Record<TimeSlotGroup, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };

  const byHour: Record<number, number> = {};

  for (const audio of all) {
    const group = audio.timeSlotGroup as TimeSlotGroup;
    if (group && byGroup[group] !== undefined) {
      byGroup[group]++;
    }

    const h = audio.hourValue ?? -1;
    if (h >= 0) {
      byHour[h] = (byHour[h] || 0) + 1;
    }
  }

  return { total: all.length, byGroup, byHour };
}

/**
 * Marks an audio as used for a specific date and hour.
 */
export async function markAudioUsed(
  audioId: string,
  date: Date,
  hour: number
): Promise<void> {
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  await prisma.generatedAudio.update({
    where: { id: audioId },
    data: {
      lastUsedAt: new Date(),
      lastUsedDate: dateOnly,
      useCount: { increment: 1 },
    },
  });

  await prisma.audioSchedule.create({
    data: {
      audioId,
      scheduledDate: date,
      scheduledHour: hour,
      enabled: true,
    },
  });
}

/**
 * Returns whether the system should generate audio during low-audience hours.
 * Based on current time, generation should happen between 00:00 and 05:00.
 */
export function isLowAudienceWindow(): boolean {
  const hour = new Date().getHours();
  return hour >= 0 && hour <= 5;
}

/**
 * Returns hours for the current day that still need time announcements.
 */
export async function getPendingHoursForToday(): Promise<number[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();
  const currentHour = now.getHours();

  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const futureHours = allHours.filter((h) => h > currentHour);

  const schedules = await prisma.audioSchedule.findMany({
    where: {
      scheduledDate: today,
      enabled: true,
      scheduledHour: { in: futureHours },
    },
  });

  const coveredHours = new Set(
    schedules.map((s: { scheduledHour: number }) => s.scheduledHour)
  );
  return futureHours.filter((h) => !coveredHours.has(h));
}
