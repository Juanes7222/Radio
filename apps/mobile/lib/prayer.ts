import { Ionicons } from '@expo/vector-icons';

export type PrayerStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESPONDIDA' | 'CERRADA';

export interface PrayerItem {
  id: string;
  name: string;
  request: string;
  estado: PrayerStatus;
  respuesta: string | null;
  createdAt: string;
  answeredAt: string | null;
  readAt?: string | null;
}

type PrayerStatusIcon = keyof typeof Ionicons.glyphMap;

export const PRAYER_STATUS_CONFIG: Record<
  PrayerStatus,
  { label: string; icon: PrayerStatusIcon; color: string }
> = {
  PENDIENTE: { label: 'Pendiente', icon: 'time-outline', color: '#eab308' },
  EN_REVISION: { label: 'En revisión', icon: 'sync-outline', color: '#3b82f6' },
  RESPONDIDA: { label: 'Respondida', icon: 'checkmark-circle', color: '#22c55e' },
  CERRADA: { label: 'Cerrada', icon: 'lock-closed-outline', color: '#6b7280' },
};

export function getPrayerStatusConfig(estado: PrayerStatus) {
  return PRAYER_STATUS_CONFIG[estado] ?? PRAYER_STATUS_CONFIG.PENDIENTE;
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
