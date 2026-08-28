import { prisma } from "../../infrastructure/database/prisma";
import { normalizeSearch } from "../../shared/utils/sanitize";
import { parseSubscriptions } from "../../shared/utils/subscriptions";

export type NoticeAudience = "all" | "zone" | "platform" | "program" | "devices";
export type NoticeVariant = "info" | "event" | "warning" | "prayer";

export interface NoticeFilters {
  deviceId?: string;
  zoneId?: string;
  platform?: string;
  subscriptions?: string[];
}

/**
 * Determina si un aviso aplica para el usuario segun su contexto.
 * La evaluacion es pura y no toca IO, para testear facilmente.
 */
export function noticeMatchesAudience(
  notice: {
    audience: string;
    audienceZoneId: string | null;
    audiencePlatform: string | null;
    audienceProgram: string | null;
    audienceDeviceIds: string | null;
  },
  ctx: NoticeFilters,
): boolean {
  switch (notice.audience as NoticeAudience) {
    case "all":
      return true;
    case "zone":
      return Boolean(notice.audienceZoneId && ctx.zoneId === notice.audienceZoneId);
    case "platform":
      return Boolean(notice.audiencePlatform && ctx.platform === notice.audiencePlatform);
    case "program": {
      if (!notice.audienceProgram || !ctx.subscriptions?.length) return false;
      const target = normalizeSearch(notice.audienceProgram);
      return ctx.subscriptions.some((s) => normalizeSearch(s) === target);
    }
    case "devices": {
      if (!notice.audienceDeviceIds || !ctx.deviceId) return false;
      try {
        const ids: string[] = JSON.parse(notice.audienceDeviceIds);
        return ids.includes(ctx.deviceId);
      } catch {
        return false;
      }
    }
    default:
      return true;
  }
}

/**
 * Devuelve los avisos activos dentro de ventana temporal,
 * opcionalmente filtrados por audiencia del dispositivo.
 * Si no se provee contexto, devuelve solo audience=all.
 */
export async function getActiveNotices(ctx: NoticeFilters = {}) {
  const now = new Date();
  const rows = await (prisma as unknown as { appNotice: { findMany: (a: unknown) => Promise<never[]> } }).appNotice.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: [{ createdAt: "desc" }],
  } as never) as Array<{
    id: string; title: string; body: string; imageUrl: string | null; ctaLabel: string | null; ctaUrl: string | null;
    variant: string; audience: string; audienceZoneId: string | null; audiencePlatform: string | null;
    audienceProgram: string | null; audienceDeviceIds: string | null; startsAt: Date; endsAt: Date;
    maxDisplaysPerUser: number; dismissible: boolean; isActive: boolean; createdAt: Date;
  }>;

  // Si no hay contexto, entrega solo globales para no filtrar de mas
  const hasContext = Boolean(ctx.deviceId || ctx.zoneId || ctx.platform || ctx.subscriptions?.length);
  if (!hasContext) {
    return rows.filter((n) => n.audience === "all");
  }

  // Para contexto con deviceId, necesitamos subscriptions reales si no vienen
  let subscriptions = ctx.subscriptions;
  let zoneId = ctx.zoneId;
  let platform = ctx.platform;
  if (ctx.deviceId && (!subscriptions || !zoneId)) {
    const device = await (prisma as unknown as { device: { findUnique: (a: unknown) => Promise<never> } }).device.findUnique({
      where: { deviceId: ctx.deviceId },
      select: { subscriptions: true, zoneId: true, platform: true },
    } as never) as { subscriptions: string | null; zoneId: string | null; platform: string | null } | null;
    if (device) {
      subscriptions = subscriptions ?? parseSubscriptions(device.subscriptions);
      zoneId = zoneId ?? device.zoneId ?? undefined;
      platform = platform ?? device.platform ?? undefined;
    }
  }

  const enriched: NoticeFilters = { deviceId: ctx.deviceId, zoneId, platform, subscriptions };
  return rows.filter((n) => noticeMatchesAudience(n, enriched));
}
