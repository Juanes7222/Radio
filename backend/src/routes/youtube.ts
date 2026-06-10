import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { parseWebhookXml } from "../utils/xml.parser";
import { logger } from "../utils/logger";

const router = Router();

// YouTube verifica la suscripción con un GET que incluye hub.challenge
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
  // Responde inmediatamente para que YouTube no reintente
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
    data: { videoId, status: "PENDING" },
  });

  logger.info("YouTubeRouter", "Job created", { videoId });

});

export default router;