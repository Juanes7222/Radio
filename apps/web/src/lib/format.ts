/** Utilidades compartidas de formato de fechas y duraciones. */

/** "hace 2 días", "hace 5 min", "ahora" */
export function timeAgo(date: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (!date) return '—';
  const diff = now - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  const minutes = Math.floor(diff / 60000);
  if (minutes > 0) return `hace ${minutes} min`;
  return 'ahora';
}

/** "hace 5 min" en formato corto para tablas (h → horas, d → días) */
export function timeAgoShort(value: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (!value) return '—';
  const diff = now - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

/** Fecha legible en español (Colombia): "16 ago 2026, 03:45 p. m." */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Fecha completa con hora: "16/08/2026, 03:45:12 p. m." */
export function formatDateTimeFull(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

/** Duración en formato "1h 30m", "45m" o "30s" */
export function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '—';
  if (secs < 60) return `${Math.floor(secs)}s`;
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Capítulos en formato compacto: "Génesis 1-7" o "Génesis 1-2, Éxodo 3" */
export function formatChapters(chapters: { book: string; chapter: number }[]): string {
  if (chapters.length === 0) return '—';

  const parts: string[] = [];
  let current: { book: string; chapter: number } | null = null;
  let rangeStart = 0;

  const flush = () => {
    if (!current) return;
    if (rangeStart === current.chapter) {
      parts.push(`${current.book} ${current.chapter}`);
    } else {
      parts.push(`${current.book} ${rangeStart}-${current.chapter}`);
    }
  };

  for (const chapter of chapters) {
    if (current && current.book === chapter.book && chapter.chapter === current.chapter + 1) {
      current = chapter;
    } else {
      flush();
      current = chapter;
      rangeStart = chapter.chapter;
    }
  }
  flush();

  return parts.join(', ');
}

/** Tiempo en formato "mm:ss" o "hh:mm:ss" */
export function formatClock(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}
