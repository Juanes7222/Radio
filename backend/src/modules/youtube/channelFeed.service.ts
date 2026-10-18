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

/**
 * The Atom feed of a channel's uploads, and the WebSub topic the hub subscribes to.
 *
 * Both readers need the same URL, so it is built here once: a hub watching a
 * different feed than the panel reports on is a failure nobody can see.
 *
 * Do not move this to `/xml/feeds/videos.xml`. Measured on 18 Oct 2026, that path
 * answers 200 with the same 463 byte document for a real channel, for someone
 * else's channel and for an invented id: a stub with no `<entry>` and no
 * `yt:channelId`, so a topic there has nothing to publish. This path answers the
 * real feed, and 404s for a channel id that does not exist.
 */
export function channelFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
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
 * An empty list is a valid answer: the channel exists and has nothing new, so the
 * caller records the count rather than treating it as a failure. A 404 is not one:
 * it means the channel id does not exist, which is what a mistyped id looks like.
 */
export async function fetchChannelFeed(channelId: string): Promise<ChannelFeedSnapshot> {
  const response = await fetch(channelFeedUrl(channelId), {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    headers: { Accept: "application/atom+xml" },
  });

  if (!response.ok) {
    throw new Error(`El feed respondió ${response.status}.`);
  }

  const parsed = parser.parse(await response.text()) as { feed?: unknown };
  return { entries: toEntries(parsed.feed) };
}