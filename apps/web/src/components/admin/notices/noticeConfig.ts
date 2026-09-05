import type { AppNotice, NoticeAudience, NoticeVariant } from "@radio/types";

export interface NoticeVariantStyle {
  label: string;
  dot: string;
  border: string;
  badge: string;
}

// Single source of truth for variant styling, shared by the board and the preview.
export const VARIANT_CFG: Record<NoticeVariant, NoticeVariantStyle> = {
  info: { label: "Informativo", dot: "bg-info", border: "border-l-info", badge: "bg-info/10 text-info border-info/20" },
  event: { label: "Evento", dot: "bg-primary", border: "border-l-primary", badge: "bg-primary/10 text-primary border-primary/20" },
  warning: { label: "Urgente", dot: "bg-warning", border: "border-l-warning", badge: "bg-warning/10 text-warning border-warning/20" },
  prayer: { label: "Oración", dot: "bg-success", border: "border-l-success", badge: "bg-success/10 text-success border-success/20" },
};

export const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  all: "Todos",
  zone: "Por zona",
  platform: "Por plataforma",
  program: "Por programa",
  devices: "Dispositivos seleccionados",
};

export function getNoticeStatus(notice: AppNotice): { label: string; tone: string } {
  const now = Date.now();
  const start = new Date(notice.startsAt).getTime();
  const end = new Date(notice.endsAt).getTime();
  if (!notice.isActive) return { label: "Pausado", tone: "bg-muted text-muted-foreground border-border" };
  if (now < start) return { label: "Programado", tone: "bg-info/10 text-info border-info/20" };
  if (now > end) return { label: "Expirado", tone: "bg-muted text-muted-foreground border-border" };
  return { label: "Activo", tone: "bg-success/10 text-success border-success/20" };
}

export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
