import axios from 'axios';
import type { ProgramEpisodeStatus } from '@radio/types';

/** Días de AzuraCast: 1 = lunes ... 7 = domingo. */
export const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export const ALL_DAYS_MASK = 0b1111111;

export const EPISODE_STATUS_LABELS: Record<ProgramEpisodeStatus, string> = {
  draft: 'Sin publicar',
  processing: 'Publicando',
  queued: 'En cola',
  played: 'Reproducido',
  failed: 'Fallido',
};

export const EPISODE_STATUS_CLASSES: Record<ProgramEpisodeStatus, string> = {
  draft: 'bg-info/10 text-info',
  processing: 'bg-primary/10 text-primary',
  queued: 'bg-primary/10 text-primary',
  played: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
};

export const SCHEDULE_MODE_LABELS = {
  none: 'Sin programar',
  auto: 'Automática',
  manual: 'Manual',
} as const;

export const SCHEDULE_MODE_HINTS: Record<keyof typeof SCHEDULE_MODE_LABELS, string> = {
  none: 'El episodio entra en la playlist y la programación la manejas a mano en AzuraCast.',
  auto: 'El sistema busca la primera franja libre que no choque con otro programa.',
  manual: 'Eliges el día y la hora al subir el episodio; se valida contra la programación.',
};

/** Extrae el mensaje de error de una respuesta del panel admin. */
export function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(err)) {
    return err.response?.data?.error ?? err.message ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

/** Convierte un File a un nombre base sin extensión. */
export function fileNameWithoutExtension(file: File): string {
  return file.name.replace(/\.[a-z0-9]+$/i, '');
}

/** Suma los bits de los días seleccionados en un Set de índices 1..7. */
export function daysMaskToSet(mask: number): Set<number> {
  const selected = new Set<number>();
  for (let dayIndex = 1; dayIndex <= 7; dayIndex++) {
    if ((mask & (1 << (dayIndex - 1))) !== 0) selected.add(dayIndex);
  }
  return selected;
}

export function setToDaysMask(selected: Set<number>): number {
  let mask = 0;
  for (const dayIndex of selected) mask |= 1 << (dayIndex - 1);
  return mask;
}