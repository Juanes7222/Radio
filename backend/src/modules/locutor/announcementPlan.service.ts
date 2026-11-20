import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";
import { analyzeDay, isFreeMinuteAt, type DayAnalysis } from "./freeWindows.service";
import { getSettings, type AnnouncementSettings } from "./settings.service";

export interface PlannedSlot {
  minuteOfDay: number;
  plannedFor: Date;
}

export interface PlanResult {
  dayKey: string;
  slots: PlannedSlot[];
  analysis: DayAnalysis;
  droppedByGap: number;
}

/** Resolves a station-local minute and skips clock times absent on a DST change. */
function stationInstantFor(timezone: string, dayKey: string, minuteOfDay: number): Date | null {
  const [year, month, day] = dayKey.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let instant = wallClock;

  for (let attempt = 0; attempt < 3; attempt++) {
    const time = getStationTime(new Date(instant), timezone);
    const represented = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
    if (represented === wallClock) return new Date(instant);
    instant += wallClock - represented;
  }

  return null;
}

type ExistingSlot = PlannedSlot & {
  id: string;
  status: string;
  playedAt: Date | null;
  retryAt: Date | null;
};

function selectSlots(
  date: Date,
  analysis: DayAnalysis,
  settings: AnnouncementSettings,
  existing: ExistingSlot[]
): PlanResult {
  const time = getStationTime(date, settings.timezone);
  const nowMinute = time.hour * 60 + time.minute;
  const firstNewMinute = nowMinute + 2;
  const reserved: number[] = [];
  const slots: PlannedSlot[] = [];
  let droppedByGap = 0;

  for (const slot of existing) {
    if (slot.status === "pending" && slot.plannedFor > date) continue;

    const actualTime = slot.playedAt ?? slot.retryAt ?? slot.plannedFor;
    const actual = getStationTime(actualTime, settings.timezone);
    if (actual.dayKey === analysis.dayKey) reserved.push(actual.hour * 60 + actual.minute);
  }

  function hasRoom(minute: number): boolean {
    const hour = Math.floor(minute / 60);
    return reserved.filter((other) => Math.floor(other / 60) === hour).length < settings.perHour;
  }

  function tryMinute(minuteOfDay: number, plannedFor: Date): void {
    if (reserved.some((other) => other === minuteOfDay || Math.abs(other - minuteOfDay) < settings.minGapMinutes)) {
      droppedByGap++;
      return;
    }

    slots.push({ minuteOfDay, plannedFor });
    reserved.push(minuteOfDay);
  }

  for (const slot of existing) {
    if (slot.status !== "pending" || slot.plannedFor <= date || !hasRoom(slot.minuteOfDay) ||
      !isFreeMinuteAt(analysis, slot.minuteOfDay)) continue;
    const expected = stationInstantFor(settings.timezone, analysis.dayKey, slot.minuteOfDay);
    if (expected?.getTime() === slot.plannedFor.getTime()) tryMinute(slot.minuteOfDay, slot.plannedFor);
  }

  for (let hour = time.hour; hour < 24; hour++) {
    const start = hour * 60;
    const end = start + 60;
    const candidates = analysis.freeWindows.flatMap((window) => {
      const from = Math.max(start, firstNewMinute, window.startMinute);
      const until = Math.min(end, window.endMinute);
      return Array.from({ length: Math.max(0, until - from) }, (_, index) => from + index);
    });

    while (hasRoom(start) && candidates.length > 0) {
      const index = Math.floor(Math.random() * candidates.length);
      const [minuteOfDay] = candidates.splice(index, 1);
      const plannedFor = stationInstantFor(settings.timezone, analysis.dayKey, minuteOfDay);
      if (plannedFor && plannedFor > date) tryMinute(minuteOfDay, plannedFor);
    }
  }

  slots.sort((first, second) => first.minuteOfDay - second.minuteOfDay);
  return { dayKey: analysis.dayKey, slots, analysis, droppedByGap };
}

export async function buildPlan(date: Date = new Date()): Promise<PlanResult> {
  const settings = await getSettings();
  const analysis = await getDayAnalysis(date, settings);
  return selectSlots(date, analysis, settings, []);
}

export async function replanAnnouncements(date: Date = new Date()): Promise<number> {
  const settings = await getSettings();
  if (!settings.enabled) {
    await prisma.announcementSlot.updateMany({
      where: { status: { in: ["pending", "deferred"] } },
      data: { status: "skipped", reason: "Deshabilitado desde el panel", settledAt: new Date() },
    });
    return 0;
  }

  const analysis = await getDayAnalysis(date, settings);
  if (analysis.degraded) {
    return prisma.announcementSlot.count({ where: { planDate: analysis.dayKey, status: "pending" } });
  }

  const cutoff = new Date(Math.max(date.getTime(), Date.now()));
  if (getStationTime(cutoff, settings.timezone).dayKey !== analysis.dayKey) return 0;

  const plan = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.announcementSlot.findMany({
      where: { planDate: analysis.dayKey, status: { in: ["pending", "running", "deferred", "played"] } },
      orderBy: { minuteOfDay: "asc" },
    });
    const plan = selectSlots(cutoff, analysis, settings, existing);
    const futurePending = existing.filter((slot) => slot.status === "pending" && slot.plannedFor > cutoff);
    const existingByTime = new Map(futurePending.map((slot) => [slot.plannedFor.getTime(), slot.id]));
    const retained = new Set(plan.slots.map((slot) => slot.plannedFor.getTime()));
    const removals = futurePending.filter((slot) => {
      const time = slot.plannedFor.getTime();
      return !retained.has(time) || existingByTime.get(time) !== slot.id;
    });

    await transaction.announcementSlot.deleteMany({
      where: {
        status: "pending",
        plannedFor: { gt: cutoff },
        id: { in: removals.map((slot) => slot.id) },
      },
    });

    const added = plan.slots.filter((slot) => !existingByTime.has(slot.plannedFor.getTime()));
    if (added.length > 0) {
      await transaction.announcementSlot.createMany({
        data: added.map((slot) => ({ ...slot, planDate: plan.dayKey })),
      });
    }
    return plan;
  });

  logger.info("AnnouncementPlan", "Plan reconciled", {
    dayKey: plan.dayKey,
    slotCount: plan.slots.length,
    droppedByGap: plan.droppedByGap,
    freeMinutes: plan.analysis.freeMinutes,
  });

  return plan.slots.length;
}

export async function getDayAnalysis(
  date: Date = new Date(),
  settings?: AnnouncementSettings
): Promise<DayAnalysis> {
  const effective = settings ?? await getSettings();
  return analyzeDay(date, {
    timezone: effective.timezone,
    edgeMarginMinutes: effective.windowEdgeMarginMinutes,
    minWindowMinutes: effective.minWindowMinutes,
  });
}

export async function getHoursWithFreeWindow(date: Date): Promise<Set<number>> {
  const analysis = await getDayAnalysis(date);
  const hours = new Set<number>();
  for (const window of analysis.freeWindows) {
    const firstHour = Math.floor(window.startMinute / 60);
    const lastHour = Math.floor((window.endMinute - 1) / 60);
    for (let hour = firstHour; hour <= lastHour; hour++) hours.add(hour);
  }
  return hours;
}
