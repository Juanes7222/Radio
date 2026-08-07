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
