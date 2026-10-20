import type { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export type PrayerStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESPONDIDA' | 'CERRADA';

export interface PrayerItem {
  id: string;
  name: string;
  request: string;
  estado: PrayerStatus;
  respuesta: string | null;
  createdAt: string;
  answeredAt: string | null;
  /** When this listener opened the answer. Mirrors PrayerRequest.answerReadAt. */
  answerReadAt: string | null;
  readAt?: string | null;
}

type PrayerStatusIcon = keyof typeof Ionicons.glyphMap;

/**
 * The state of a petition, in the app's own vocabulary.
 *
 * "Pendiente" is the default state, so it stays quiet: the thread node already
 * says "waiting" and the amber of the palette belongs to the sleep timer and
 * to alerts, not to every petition the team has not reached yet. The states
 * that need a voice keep one: blue for a petition under review, green for an
 * answered one.
 */
export const PRAYER_STATUS_CONFIG: Record<
  PrayerStatus,
  { label: string; icon: PrayerStatusIcon; color: string }
> = {
  PENDIENTE: { label: 'Pendiente', icon: 'time-outline', color: Colors.textMuted },
  EN_REVISION: { label: 'En revisión', icon: 'sync-outline', color: Colors.info },
  RESPONDIDA: { label: 'Respondida', icon: 'checkmark-circle', color: Colors.success },
  CERRADA: { label: 'Cerrada', icon: 'lock-closed-outline', color: Colors.textFaint },
};

export function getPrayerStatusConfig(estado: PrayerStatus) {
  return PRAYER_STATUS_CONFIG[estado] ?? PRAYER_STATUS_CONFIG.PENDIENTE;
}

/**
 * True when the team has answered and this listener has not opened the answer
 * yet. The strict `=== null` is deliberate: a missing field means an older
 * backend, and claiming "unread" on an unknown state would light up every
 * badge after a deploy that only touched the app.
 */
export function hasUnreadAnswer(item: PrayerItem): boolean {
  return Boolean(item.respuesta) && item.answerReadAt === null;
}

/** Singular/plural agreement for the "N respuestas sin leer" summary. */
export function unreadAnswerSummary(count: number): string {
  return count === 1
    ? 'Tienes 1 respuesta sin leer'
    : `Tienes ${count} respuestas sin leer`;
}

export function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `Hace ${days} día${days > 1 ? 's' : ''}`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
  const minutes = Math.floor(diff / 60000);
  if (minutes > 0) return `Hace ${minutes} min`;
  return 'Ahora';
}

const STATION_TIME_ZONE = 'America/Bogota';

/** The calendar day of a moment in the station's timezone, as YYYY-MM-DD. */
function stationDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STATION_TIME_ZONE }).format(date);
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
    timeZone: STATION_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const day = stationDayKey(date);
  if (day === stationDayKey(now)) return `Hoy, ${time}`;
  if (day === stationDayKey(new Date(now.getTime() - 86400000))) return `Ayer, ${time}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  const label = new Intl.DateTimeFormat('es-CO', {
    timeZone: STATION_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);

  return `${label}, ${time}`;
}
