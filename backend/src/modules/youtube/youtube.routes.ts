import { Router, type Request, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { parseWebhookXml } from "../../shared/utils/xml-parser";
import { logger } from "../../shared/logger/logger";
import { ingestVideo } from "./ingest.service";

const router = Router();

// YouTube verifies the subscription with a GET that includes hub.challenge
router.get("/webhook", (req: Request, res: Response) => {
  const challenge = req.query["hub.challenge"];
  const mode = req.query["hub.mode"];

  if (mode === "subscribe" && challenge) {
    logger.info("YouTubeRouter", "Webhook verification successful");
    res.status(200).send(challenge);
    return;
  }

  res.status(400).send("Invalid verification request");
});

router.post("/webhook", async (req: Request, res: Response) => {
  // Respond immediately so YouTube does not retry
  res.status(200).send("OK");

  const rawBody = req.body;
  const xml = typeof rawBody === "string" ? rawBody : rawBody?.toString?.() ?? "";

  const entry = parseWebhookXml(xml);
  if (!entry) {
    logger.warn("YouTubeRouter", "Could not parse webhook XML");
    return;
  }

  const { videoId, channelId, title, publishedAt } = entry;
  logger.info("YouTubeRouter", "Webhook received", { videoId, channelId });

  // A channel removed from the panel can still be pushed for the rest of its
  // 24 hour lease. Creating a job for it would put content on air that the admin
  // deliberately took off the list, so the notification is dropped instead. The
  // 200 above stays: the hub must not retry a decision we already made.
  const channel = await prisma.youTubeChannel.findUnique({
    where: { channelId },
    select: { id: true },
  });
  if (!channel) {
    logger.warn("YouTubeRouter", "Notification from a channel that is not registered", {
      videoId,
      channelId,
    });
    return;
  }

  // The poller reports the same uploads, so the duplicate is not an error: the
  // first report created the video and its job.
  const created = await ingestVideo({ videoId, channelId, title, publishedAt });
  if (!created) {
    logger.info("YouTubeRouter", "Duplicate video, skipping", { videoId });
  }
});

export default router;
