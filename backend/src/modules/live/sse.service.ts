import type { Response } from "express";
import { readFileSync, writeFileSync } from "fs";
import { sendPushCampaign } from "../devices/push.service";
import { logger } from "../../shared/logger/logger";

const STATE_FILE = "/var/www/radio/live-state.json";
const HEARTBEAT_INTERVAL_MS = 30_000;

const clients = new Set<Response>();

interface LiveState {
  liveUrl: string | null;
}

function loadState(): string | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")).liveUrl ?? null;
  } catch {
    return null;
  }
}

function saveState(url: string | null): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ liveUrl: url }), "utf-8");
  } catch (error) {
    logger.error("SseService", "Error saving live state", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

let currentLiveUrl: string | null = loadState();

export function addSSEClient(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  clients.add(res);

  if (currentLiveUrl !== null) {
    const data = JSON.stringify({ status: "live", url: currentLiveUrl });
    res.write(`event: live_start\ndata: ${data}\n\n`);
  } else {
    const data = JSON.stringify({ status: "idle" });
    res.write(`event: live_end\ndata: ${data}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, HEARTBEAT_INTERVAL_MS);

  res.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

function broadcast(message: string): void {
  for (const client of clients) {
    try {
      client.write(message);
    } catch (error) {
      logger.error("SseService", "Error sending SSE to client", {
        error: error instanceof Error ? error.message : String(error),
      });
      clients.delete(client);
    }
  }
}

export function notifyLiveStart(permalinkUrl: string): void {
  currentLiveUrl = permalinkUrl;
  saveState(permalinkUrl);

  const data = JSON.stringify({ status: "live", url: permalinkUrl });
  broadcast(`event: live_start\ndata: ${data}\n\n`);

  void sendLivePushNotification(permalinkUrl);
}

async function sendLivePushNotification(permalinkUrl: string): Promise<void> {
  try {
    const result = await sendPushCampaign({
      audience: "all",
      title: "En vivo ahora",
      body: "La emisora está en transmisión en vivo",
      data: { isLiveNotify: "true", url: permalinkUrl },
    });
    logger.info("SseService", "Live push notification sent", {
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error) {
    logger.error("SseService", "Error sending live push notification", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function notifyLiveEnd(): void {
  currentLiveUrl = null;
  saveState(null);

  const data = JSON.stringify({ status: "idle" });
  broadcast(`event: live_end\ndata: ${data}\n\n`);
}

export function getCurrentLiveUrl(): string | null {
  return currentLiveUrl;
}
