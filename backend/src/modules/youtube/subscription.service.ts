import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { prisma } from "../../infrastructure/database/prisma";
import { fetchChannelFeed } from "./channelFeed.service";

const PUBSUBHUBBUB_HUB = "https://pubsubhubbub.appspot.com/subscribe";
const LEASE_SECONDS = 86400; // 24 hours

/**
 * A lease is renewed once it is inside one cron pass, so `expiring` in the panel
 * and "the cron will renew it" are the same moment. The two must not drift apart.
 */
export const RESUBSCRIBE_MARGIN_MS = 6 * 60 * 60 * 1000;

export const WEBHOOK_PATH = "/admin-api/youtube/webhook";

function topicUrl(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

async function callHub(mode: "subscribe" | "unsubscribe", channelId: string): Promise<void> {
  const params = new URLSearchParams({
    "hub.callback": `${config.publicUrl}${WEBHOOK_PATH}`,
    "hub.topic": topicUrl(channelId),
    "hub.mode": mode,
    "hub.lease_seconds": String(LEASE_SECONDS),
    "hub.verify": "async",
  });

  const response = await fetch(PUBSUBHUBBUB_HUB, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status !== 202 && response.status !== 200 && response.status !== 204) {
    throw new Error(`Hub respondió ${response.status}: ${await response.text()}`);
  }
}

/**
 * Subscribes one channel and writes the outcome on its row. A failure is recorded
 * before it is rethrown, because the panel reports the last error rather than a
 * boolean, and a renewal that failed is what an operator needs to see.
 *
 * The row has to exist already: the caller creates it. A channel reaching the hub
 * without one is a caller bug, not a case to paper over with an upsert.
 */
export async function subscribeToChannel(channelId: string): Promise<void> {
  try {
    await callHub("subscribe", channelId);
    const now = new Date();

    await prisma.youTubeChannel.update({
      where: { channelId },
      data: {
        subscribedAt: now,
        expiresAt: new Date(now.getTime() + LEASE_SECONDS * 1000),
        subscriptionError: null,
      },
    });
  } catch (err) {
    await prisma.youTubeChannel.update({
      where: { channelId },
      data: { subscriptionError: String(err) },
    });
    throw err;
  }
}

/**
 * Best-effort remote cleanup. It does not touch the database: the caller decides
 * what happens to the row, and the hub being unreachable must not block that.
 */
export async function unsubscribeFromChannel(channelId: string): Promise<void> {
  await callHub("unsubscribe", channelId);
}

/**
 * Renews the lease and rechecks the feed of every registered channel.
 *
 * Both steps are isolated per channel: one unreachable hub or one dead feed must
 * not stop the rest of the list from being refreshed, which is why neither failure
 * leaves this function.
 */
export async function refreshChannelSubscriptions(): Promise<void> {
  const channels = await prisma.youTubeChannel.findMany();

  for (const channel of channels) {
    const leaseEndsSoon =
      channel.expiresAt === null || channel.expiresAt.getTime() - Date.now() <= RESUBSCRIBE_MARGIN_MS;

    if (leaseEndsSoon) {
      try {
        await subscribeToChannel(channel.channelId);
      } catch (err) {
        logger.error("SubscriptionService", "Failed to renew subscription", {
          channelId: channel.channelId,
          error: String(err),
        });
      }
    }

    try {
      const { entries } = await fetchChannelFeed(channel.channelId);
      await prisma.youTubeChannel.update({
        where: { channelId: channel.channelId },
        data: { feedEntryCount: entries.length, feedCheckedAt: new Date() },
      });
    } catch (err) {
      logger.warn("SubscriptionService", "Could not check the channel feed", {
        channelId: channel.channelId,
        error: String(err),
      });
    }
  }
}