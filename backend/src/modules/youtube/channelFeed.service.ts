import { XMLParser } from "fast-xml-parser";

export interface ChannelFeedEntry {
  videoId: string;
  title: string;
  publishedAt: Date | null;
}

export interface ChannelFeedSnapshot {
  entries: ChannelFeedEntry[];
}

const FEED_TIMEOUT_MS = 15_000;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function feedUrl(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

function toEntries(feed: unknown): ChannelFeedEntry[] {
  const raw = (feed as { entry?: unknown } | undefined)?.entry;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const entries: ChannelFeedEntry[] = [];

  for (const item of list) {
    const entry = item as Record<string, unknown>;
    const videoId = entry["yt:videoId"];
    const title = entry["title"];
    if (typeof videoId !== "string" || typeof title !== "string") continue;

    const published = entry["published"];
    const publishedAt = typeof published === "string" ? new Date(published) : null;

    entries.push({
      videoId,
      title,
      publishedAt: publishedAt !== null && Number.isNaN(publishedAt.getTime()) ? null : publishedAt,
    });
  }

  return entries;
}

/**
 * Reads the public Atom feed a WebSub topic points at.
 *
 * It answers `200` with an empty stub for every `channel_id`, including ids that
 * do not exist, so the entry count is the only signal about whether a channel will
 * ever notify. Measured on 16 Oct 2026: the same 463 bytes for a real channel, for
 * the project's example channel and for an invented id.
 *
 * An empty list is therefore a valid answer, not a failure: the caller records the
 * count so the panel can show that the channel is registered but will stay quiet.
 */
export async function fetchChannelFeed(channelId: string): Promise<ChannelFeedSnapshot> {
  const response = await fetch(feedUrl(channelId), {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    headers: { Accept: "application/atom+xml" },
  });

  if (!response.ok) {
    throw new Error(`El feed respondió ${response.status}.`);
  }

  const parsed = parser.parse(await response.text()) as { feed?: unknown };
  return { entries: toEntries(parsed.feed) };
}