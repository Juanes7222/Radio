import { config } from "../../config";
import { logger } from "../logger/logger";

export const BOGOTA_TIME_ZONE = "America/Bogota";

/** Formats a date as YYYY-MM-DD in the Bogota time zone. */
export function getBogotaDateString(daysOffset = 0): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const now = new Date();
  const target = new Date(now);
  target.setDate(now.getDate() + daysOffset);

  return formatter.format(target);
}

/** Builds a sortable YYYY-MM-DD key from a date in local time. */
export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns a date with the time part zeroed in local time. */
export function startOfDay(date: Date = new Date()): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Returns the 1-based day of year index (1 = January 1st). */
export function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calendar values of an instant inside the station time zone. Cron jobs are
 * registered with `config.locutor.timezone`, so every hour, minute and weekday
 * the announcement system reasons about must be read from here: the host
 * process time zone is not guaranteed to match the station one.
 */
export interface StationTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday, matching Date.getDay(). */
  dayIndex: number;
  /** YYYY-MM-DD of the station calendar. */
  dayKey: string;
}

const STATION_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

let stationTimeFormat: Intl.DateTimeFormat | null = null;

function getStationTimeFormat(): Intl.DateTimeFormat {
  if (stationTimeFormat) return stationTimeFormat;

  try {
    stationTimeFormat = new Intl.DateTimeFormat("en-CA", {
      ...STATION_TIME_FORMAT_OPTIONS,
      timeZone: config.locutor.timezone,
    });
  } catch {
    logger.warn("DateUtils", "Invalid TIMEZONE, falling back to UTC", {
      timezone: config.locutor.timezone,
    });
    stationTimeFormat = new Intl.DateTimeFormat("en-CA", {
      ...STATION_TIME_FORMAT_OPTIONS,
      timeZone: "UTC",
    });
  }

  return stationTimeFormat;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function getStationTime(date: Date = new Date()): StationTime {
  const parts = getStationTimeFormat().formatToParts(date);
  const year = readPart(parts, "year");
  const month = readPart(parts, "month");
  const day = readPart(parts, "day");
  // Some engines print midnight as hour 24 even with hour12 disabled.
  const hour = readPart(parts, "hour") % 24;
  const minute = readPart(parts, "minute");
  const dayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return {
    year,
    month,
    day,
    hour,
    minute,
    dayIndex,
    dayKey: `${year}-${pad(month)}-${pad(day)}`,
  };
}

/** Offset of the station time zone, in milliseconds, at the given instant. */
function getStationOffsetMs(date: Date): number {
  const parts = getStationTimeFormat().formatToParts(date);
  const asUtc = Date.UTC(
    readPart(parts, "year"),
    readPart(parts, "month") - 1,
    readPart(parts, "day"),
    readPart(parts, "hour") % 24,
    readPart(parts, "minute")
  );
  const truncatedToMinute = Math.floor(date.getTime() / 60_000) * 60_000;
  return asUtc - truncatedToMinute;
}

/**
 * Instant where the station calendar day containing `date` starts. Used as the
 * canonical `scheduledDate` key so writers and readers agree on the day
 * regardless of the host time zone.
 */
export function getStationDayStart(date: Date = new Date()): Date {
  const { year, month, day } = getStationTime(date);
  const utcMidnight = Date.UTC(year, month - 1, day);

  let result = new Date(utcMidnight);
  for (let attempt = 0; attempt < 2; attempt++) {
    result = new Date(utcMidnight - getStationOffsetMs(result));
  }

  return result;
}

/** Station day start for a date offset in days from the given instant. */
export function getStationDayStartWithOffset(daysOffset: number, from: Date = new Date()): Date {
  const shifted = new Date(getStationDayStart(from).getTime() + daysOffset * 86_400_000);
  return getStationDayStart(shifted);
}
