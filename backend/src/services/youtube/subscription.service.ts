import { config } from "../../config";
import { logger } from "../../utils/logger";
import { prisma } from "../../lib/prisma";

const PUBSUBHUBBUB_HUB = "https://pubsubhubbub.appspot.com/subscribe";
const LEASE_SECONDS = 86400; // 24 horas

export async function subscribeToChannel(channelId: string): Promise<void> {
  const callbackUrl = `${config.publicUrl}/admin-api/youtube/webhook`;
  const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

  const params = new URLSearchParams({
    "hub.callback": callbackUrl,
    "hub.topic": topicUrl,
    "hub.mode": "subscribe",
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
    const body = await response.text();
    throw new Error(`Subscription failed [${response.status}]: ${body}`);
  }

  const expiresAt = new Date(Date.now() + LEASE_SECONDS * 1000);

  await prisma.youTubeSubscription.upsert({
    where: { channelId },
    create: { channelId, expiresAt, active: true },
    update: { expiresAt, active: true, updatedAt: new Date() },
  });

  logger.info("SubscriptionService", "Subscribed to channel", { channelId, expiresAt });
}

export async function subscribeToAllConfiguredChannels(): Promise<void> {
  for (const channelId of config.youtube.channelIds) {
    try {
      await subscribeToChannel(channelId);
    } catch (err) {
      logger.error("SubscriptionService", "Failed to subscribe", { channelId, error: String(err) });
    }
  }
}
