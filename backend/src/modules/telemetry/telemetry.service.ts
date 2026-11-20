import { prisma } from "../../infrastructure/database/prisma";
import { getStationTime } from "../../shared/utils/date";
import {
  buildDailyActive,
  computeRetention,
  dayIndex,
  dayKeyFromIndex,
  type ActivityEntry,
  type DailyActivePoint,
  type RetentionReport,
} from "./telemetry.analytics";
import { fingerprintError } from "./telemetry.utils";

export interface ActivityInput {
  readonly deviceId: string;
  readonly appVersion: string | null;
  readonly platform: string | null;
}

export interface ErrorInput {
  readonly deviceId: string | null;
  readonly message: string;
  readonly stack: string | null;
  readonly appVersion: string | null;
  readonly platform: string | null;
}

export interface RecentError {
  readonly id: string;
  readonly message: string;
  readonly stack: string | null;
  readonly appVersion: string | null;
  readonly platform: string | null;
  readonly deviceId: string | null;
  readonly occurrences: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export interface TelemetrySnapshot {
  readonly stationDay: string;
  readonly windowDays: number;
  readonly activeToday: number;
  readonly dailyActive: readonly DailyActivePoint[];
  readonly retention: RetentionReport;
  readonly errors: {
    readonly unique: number;
    readonly occurrences: number;
    readonly recent: readonly RecentError[];
  };
}

const RECENT_ERRORS_LIMIT = 20;

/**
 * Records that the device opened the app today. The station day, not the
 * device clock, decides the bucket, and the unique (device, day) key makes the
 * call idempotent so a cold start per session never inflates the count.
 */
export async function recordActivity(input: ActivityInput): Promise<string> {
  const day = getStationTime().dayKey;

  await prisma.deviceActivity.upsert({
    where: { deviceId_day: { deviceId: input.deviceId, day } },
    create: {
      deviceId: input.deviceId,
      day,
      appVersion: input.appVersion,
      platform: input.platform,
    },
    update: {
      appVersion: input.appVersion,
      platform: input.platform,
    },
  });

  return day;
}

/**
 * Groups a JavaScript failure by fingerprint. The message and the stack of the
 * first occurrence are kept: later occurrences are the same failure with a
 * different call site, and overwriting them would make triage harder.
 */
export async function recordError(input: ErrorInput): Promise<void> {
  const fingerprint = fingerprintError(input.message, input.stack);

  await prisma.appError.upsert({
    where: { fingerprint },
    create: {
      fingerprint,
      message: input.message,
      stack: input.stack,
      appVersion: input.appVersion,
      platform: input.platform,
      deviceId: input.deviceId,
    },
    update: {
      occurrences: { increment: 1 },
      lastSeenAt: new Date(),
      appVersion: input.appVersion,
      platform: input.platform,
      deviceId: input.deviceId,
    },
  });
}

/**
 * Usage and failure summary for the admin panel. Retention is computed over
 * devices whose first activity falls inside the requested window, which is why
 * the cohort query looks at the whole table: a device that started before the
 * window is not a new cohort and must not be counted as one.
 */
export async function readSnapshot(windowDays: number): Promise<TelemetrySnapshot> {
  const stationDay = getStationTime().dayKey;
  const lastIndex = dayIndex(stationDay);
  if (lastIndex === null) {
    throw new Error(`Invalid station day: ${stationDay}`);
  }

  const firstDay = dayKeyFromIndex(lastIndex - (windowDays - 1));

  const [cohortRows, windowEntries, uniqueErrors, occurrenceTotals, recentErrors] =
    await Promise.all([
      prisma.deviceActivity.groupBy({ by: ["deviceId"], _min: { day: true } }),
      prisma.deviceActivity.findMany({
        where: { day: { gte: firstDay } },
        select: { deviceId: true, day: true },
      }),
      prisma.appError.count(),
      prisma.appError.aggregate({ _sum: { occurrences: true } }),
      prisma.appError.findMany({
        orderBy: { lastSeenAt: "desc" },
        take: RECENT_ERRORS_LIMIT,
      }),
    ]);

  const cohortDevices = new Set(
    cohortRows
      .filter((row) => row._min.day !== null && row._min.day >= firstDay)
      .map((row) => row.deviceId)
  );

  const entries: ActivityEntry[] = windowEntries.map((row) => ({
    deviceId: row.deviceId,
    day: row.day,
  }));
  const cohortEntries = entries.filter((entry) => cohortDevices.has(entry.deviceId));

  const dailyActive = buildDailyActive(entries, windowDays, stationDay);
  const lastPoint = dailyActive[dailyActive.length - 1];

  return {
    stationDay,
    windowDays,
    activeToday: lastPoint?.devices ?? 0,
    dailyActive,
    retention: computeRetention(cohortEntries, stationDay),
    errors: {
      unique: uniqueErrors,
      occurrences: occurrenceTotals._sum.occurrences ?? 0,
      recent: recentErrors.map((row) => ({
        id: row.id,
        message: row.message,
        stack: row.stack,
        appVersion: row.appVersion,
        platform: row.platform,
        deviceId: row.deviceId,
        occurrences: row.occurrences,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
      })),
    },
  };
}
