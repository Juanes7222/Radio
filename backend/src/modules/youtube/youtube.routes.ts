import { Router, type Request, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { parseWebhookXml } from "../../shared/utils/xml-parser";
import { logger } from "../../shared/logger/logger";
import { config } from "../../config";

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

  const existing = await prisma.youTubeVideo.findUnique({ where: { videoId } });
  if (existing) {
    logger.info("YouTubeRouter", "Duplicate video, skipping", { videoId, status: existing.status });
    return;
  }

  await prisma.youTubeVideo.create({
    data: { videoId, channelId, title, publishedAt, status: "RECEIVED", attempts: 0 },
  });

  await prisma.processingJob.create({
    data: {
      videoId,
      status: "PENDING",
      deadlineAt: new Date(Date.now() + config.processing.jobDeadlineHours * 60 * 60 * 1000),
    },
  });

  logger.info("YouTubeRouter", "Job created", { videoId });
});

export default router;
