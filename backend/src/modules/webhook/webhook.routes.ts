import { Router } from "express";
import { notifyLiveStart, notifyLiveEnd } from "../live/sse.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

const router = Router();

router.get("/facebook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.webhook.facebookVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post("/facebook", (req, res) => {
  const secret = req.headers["x-webhook-secret"] || "";

  if (secret !== config.webhook.secret) {
    logger.warn("WebhookRoutes", "Invalid webhook secret", { secret });
    return res.sendStatus(403);
  }

  const body = req.body;

  res.sendStatus(200);

  try {
    if (body?.object !== "page") return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        if (change?.field !== "live_videos") continue;

        const value = change.value || {};
        const { status, permalink_url } = value;

        if (status === "live" && permalink_url) {
          logger.info("WebhookRoutes", "Live started", { permalinkUrl: permalink_url });
          notifyLiveStart(permalink_url);
        } else if (status === "live_stopped" || status === "vod") {
          logger.info("WebhookRoutes", "Live stopped");
          notifyLiveEnd();
        }
      }
    }
  } catch (error) {
    logger.error("WebhookRoutes", "Error processing Facebook webhook", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
