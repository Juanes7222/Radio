/**
 * Time helpers for the mobile app. All schedule times are displayed in the
 * station's timezone (America/Bogota) regardless of the device timezone.
 */

const BOGOTA_TIME_ZONE = 'America/Bogota';

export function formatScheduleTime(timestampInSeconds: number): string {
  const date = new Date(timestampInSeconds * 1000);

  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Returns the day of the week (0 = Sunday ... 6 = Saturday) for a given date
 * in the Bogota timezone (UTC-5).
 */
export function getBogotaDayOfWeek(dateInput: Date | number): number {
  const timestampInSeconds =
    typeof dateInput === 'number'
      ? dateInput
      : Math.floor(dateInput.getTime() / 1000);
  const date = new Date(timestampInSeconds * 1000);
  const utcDay = date.getUTCDay();
  const utcHours = date.getUTCHours();

  // Bogota is UTC-5. If UTC hour < 5, subtracting 5 moves to the previous day.
  if (utcHours < 5) {
    return (utcDay - 1 + 7) % 7;
  }

  return utcDay;
}

/** The calendar day of a moment in the station's timezone, as YYYY-MM-DD. */
function stationDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TIME_ZONE }).format(date);
}

/**
 * A moment of a petition, in the words a listener would use: "Hoy, 18:40",
 * "Ayer, 18:40", "20 oct, 18:40". The year only shows up when it is not the
 * current one, because a petition from last year is a different thing than
 * one from last Tuesday.
 */
export function formatPrayerMoment(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';

  const time = new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const day = stationDayKey(date);
  if (day === stationDayKey(now)) return `Hoy, ${time}`;
  if (day === stationDayKey(new Date(now.getTime() - 86400000))) return `Ayer, ${time}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  const label = new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);

  return `${label}, ${time}`;
}
