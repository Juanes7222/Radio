import { prisma } from "../../infrastructure/database/prisma";
import { normalizeSearch } from "../../shared/utils/sanitize";
import { parseSubscriptions } from "../../shared/utils/subscriptions";

export type NoticeAudience = "all" | "zone" | "platform" | "program" | "devices";
export type NoticeVariant = "info" | "event" | "warning" | "prayer";
export type NoticeDisplayMode = "toast" | "modal";

export interface NoticeFilters {
  deviceId?: string;
  zoneId?: string;
  platform?: string;
  subscriptions?: string[];
}

/**
 * Checks whether a notice applies to a user given their context.
 * Pure function with no IO, easy to test in isolation.
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
 * Returns active notices within the time window,
 * optionally filtered by device audience context.
 * Without context, only global (audience=all) notices are returned.
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
    include: { galleryItems: { orderBy: { sortOrder: "asc" } } },
  } as never) as Array<{
    id: string;
    title: string;
    body: string;
    imageUrl: string | null;
    videoUrl: string | null;
    galleryItems?: Array<{ id: string; type: string; url: string; posterUrl: string | null; sortOrder: number }>;
    ctaLabel: string | null;
    ctaUrl: string | null;
    variant: string;
    audience: string;
    audienceZoneId: string | null;
    audiencePlatform: string | null;
    audienceProgram: string | null;
    audienceDeviceIds: string | null;
    startsAt: Date;
    endsAt: Date;
    maxDisplaysPerUser: number;
    dismissible: boolean;
    isActive: boolean;
    createdAt: Date;
  }>;

  // Without context, return only global notices to avoid over-filtering
  const hasContext = Boolean(ctx.deviceId || ctx.zoneId || ctx.platform || ctx.subscriptions?.length);
  if (!hasContext) {
    return rows.filter((n) => n.audience === "all");
  }

  // For device context, enrich with stored device data when needed
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
