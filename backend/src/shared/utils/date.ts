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
