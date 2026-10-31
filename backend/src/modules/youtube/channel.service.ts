import type {
  YouTubeChannelInfo,
  YoutubeChannelCategory,
  YoutubeChannelState,
} from "@radio/types";
import { prisma } from "../../infrastructure/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { fetchChannelUploads } from "./channelUploads.service";
import { parseChannelId } from "./channelId";
import {
  RESUBSCRIBE_MARGIN_MS,
  subscribeToChannel,
  unsubscribeFromChannel,
} from "./subscription.service";

export const YOUTUBE_CHANNEL_CATEGORIES = ["GENERAL", "NEWS"] as const;

type ChannelRow = {
  channelId: string;
  title: string;
  category: string;
  subscribedAt: Date | null;
  expiresAt: Date | null;
  lastNotifiedAt: Date | null;
  subscriptionError: string | null;
  feedEntryCount: number | null;
  feedCheckedAt: Date | null;
  createdAt: Date;
};

export function isYoutubeChannelCategory(value: string): value is YoutubeChannelCategory {
  return (YOUTUBE_CHANNEL_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Derived, never stored: a persisted state could contradict the row's own dates.
 * `expiring` uses the same margin as the cron, so the panel says "about to renew"
 * exactly when the renewal is going to happen.
 */
function stateOf(channel: ChannelRow, now: number): YoutubeChannelState {
  if (channel.subscriptionError !== null) return "failed";
  if (channel.feedEntryCount === null) return "unverified";
  if (channel.expiresAt === null || channel.expiresAt.getTime() - now <= RESUBSCRIBE_MARGIN_MS) {
    return "expiring";
  }
  return "subscribed";
}

function toChannelInfo(channel: ChannelRow, lastNotifiedAt: Date | null): YouTubeChannelInfo {
  const now = Date.now();
  const notifiedAt = lastNotifiedAt ?? channel.lastNotifiedAt;

  return {
    channelId: channel.channelId,
    title: channel.title,
    category: isYoutubeChannelCategory(channel.category) ? channel.category : "GENERAL",
    state: stateOf(channel, now),
    lastNotifiedAt: notifiedAt?.toISOString() ?? null,
    leaseExpiresAt: channel.expiresAt?.toISOString() ?? null,
    subscriptionError: channel.subscriptionError,
    feedEntryCount: channel.feedEntryCount,
    feedCheckedAt: channel.feedCheckedAt?.toISOString() ?? null,
    createdAt: channel.createdAt.toISOString(),
  };
}

async function latestNotificationBy(channelIds: string[]): Promise<Map<string, Date>> {
  if (channelIds.length === 0) return new Map();

  const grouped = await prisma.youTubeVideo.groupBy({
    by: ["channelId"],
    where: { channelId: { in: channelIds } },
    _max: { createdAt: true },
  });

  const latest = new Map<string, Date>();
  for (const row of grouped) {
    const at = row._max.createdAt;
    if (at) latest.set(row.channelId, at);
  }
  return latest;
}

export async function listChannels(): Promise<YouTubeChannelInfo[]> {
  const channels = await prisma.youTubeChannel.findMany({ orderBy: { createdAt: "desc" } });
  const latest = await latestNotificationBy(channels.map((channel) => channel.channelId));

  return channels.map((channel) => toChannelInfo(channel, latest.get(channel.channelId) ?? null));
}

export async function createChannel(input: {
  channelId: string;
  title: string;
  category?: YoutubeChannelCategory;
}): Promise<YouTubeChannelInfo> {
  const channelId = parseChannelId(input.channelId);
  const title = input.title.trim();
  if (!title) throw new AppError(400, "El nombre del canal es obligatorio.");

  const category = input.category ?? "GENERAL";
  if (!isYoutubeChannelCategory(category)) {
    throw new AppError(400, "La categoría debe ser GENERAL o NEWS.");
  }

  const existing = await prisma.youTubeChannel.findUnique({
    where: { channelId },
    select: { id: true },
  });
  if (existing) throw new AppError(409, "Ese canal ya está en la lista.");

  await prisma.youTubeChannel.create({ data: { channelId, title, category } });

  // Both calls record their own outcome on the row, so neither rejects the channel
  // that was just created: a feed that comes back empty is reported in the panel,
  // not treated as a failure to register.
  try {
    await subscribeToChannel(channelId);
  } catch (err) {
    logger.error("YoutubeChannels", "First subscription attempt failed", {
      channelId,
      error: String(err),
    });
  }

  try {
    const uploads = await fetchChannelUploads(channelId);
    await prisma.youTubeChannel.update({
      where: { channelId },
      data: { feedEntryCount: uploads.length, feedCheckedAt: new Date() },
    });
  } catch (err) {
    logger.warn("YoutubeChannels", "Could not check the channel feed", { channelId, error: String(err) });
  }

  const created = await prisma.youTubeChannel.findUnique({ where: { channelId } });
  if (!created) throw new AppError(500, "El canal se creó pero no se pudo leer.");
  return toChannelInfo(created, null);
}

export async function deleteChannel(channelId: string): Promise<void> {
  const channel = await prisma.youTubeChannel.findUnique({
    where: { channelId },
    select: { id: true },
  });
  if (!channel) throw new AppError(404, "Ese canal no está en la lista.");

  // The row goes first. The hub can keep pushing for the rest of its 24 hour lease
  // and the webhook ignores channels it does not know; the other order would leave
  // a row the hub no longer serves and that nobody can resubscribe.
  //
  // Videos already received stay: they are air history, and the panel keeps
  // listing them with a null channel title.
  await prisma.youTubeChannel.delete({ where: { channelId } });

  try {
    await unsubscribeFromChannel(channelId);
  } catch (err) {
    logger.warn("YoutubeChannels", "The hub did not confirm the unsubscribe", {
      channelId,
      error: String(err),
    });
  }
}

export async function resubscribeChannel(channelId: string): Promise<YouTubeChannelInfo> {
  const channel = await prisma.youTubeChannel.findUnique({ where: { channelId } });
  if (!channel) throw new AppError(404, "Ese canal no está en la lista.");

  try {
    await subscribeToChannel(channelId);
  } catch (err) {
    logger.error("YoutubeChannels", "Manual resubscribe failed", { channelId, error: String(err) });
  }

  const refreshed = await prisma.youTubeChannel.findUnique({ where: { channelId } });
  if (!refreshed) throw new AppError(404, "Ese canal no está en la lista.");
  return toChannelInfo(refreshed, null);
}

/**
 * Where a video from this channel has to land. Defaults to GENERAL because that is
 * the destination of everything that is not news, and a row with a corrupted
 * category must not leave the video without one.
 */
export async function channelCategoryOf(channelId: string): Promise<YoutubeChannelCategory> {
  if (!channelId) return "GENERAL";

  const row = await prisma.youTubeChannel.findUnique({
    where: { channelId },
    select: { category: true },
  });
  if (!row) return "GENERAL";

  return isYoutubeChannelCategory(row.category) ? row.category : "GENERAL";
}