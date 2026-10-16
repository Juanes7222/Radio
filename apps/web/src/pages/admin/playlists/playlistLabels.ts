/** Shared labels and time helpers for the playlists admin area. */

export const PLAYLIST_TYPES: Record<string, string> = {
  default: 'Estándar',
  scheduled: 'Programada',
  once: 'Una vez',
  on_request: 'Por solicitud',
};

export const PLAYLIST_ORDERS: Record<string, string> = {
  shuffle: 'Aleatoria',
  sequential: 'Secuencial',
  random: 'Random ponderado',
};

export const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DAY_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}
