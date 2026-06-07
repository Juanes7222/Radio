import { XMLParser } from "fast-xml-parser";

export interface WebhookEntry {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: Date;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export function parseWebhookXml(xml: string): WebhookEntry | null {
  try {
    const doc = parser.parse(xml);
    const feed = doc?.feed;
    const entry = feed?.entry;

    if (!entry) return null;

    const videoId = entry["yt:videoId"] ?? entry?.["yt:videoid"];
    const channelId = entry["yt:channelId"] ?? feed["yt:channelId"];
    const title = entry?.title;
    const publishedAt = entry?.published ? new Date(entry.published) : new Date();

    if (!videoId || !channelId || !title) return null;

    return { videoId, channelId, title, publishedAt };
  } catch {
    return null;
  }
}