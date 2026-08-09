import cron from "node-cron";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { prisma } from "../../infrastructure/database/prisma";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

const CRON_SCHEDULE = "*/5 * * * *";
const LOOK_AHEAD_SECONDS = 10 * 60;
const FETCH_WINDOW_SECONDS = 24 * 60 * 60;
const RETENTION_DAYS = 7;

interface UpcomingProgram {
  id: number;
  startTimestamp: number;
  title: string;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseSubscriptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractUpcomingPrograms(items: unknown[]): UpcomingProgram[] {
  const nowUtcSeconds = Math.floor(Date.now() / 1000);
  const windowEndUtcSeconds = nowUtcSeconds + LOOK_AHEAD_SECONDS;
  const seen = new Set<string>();
  const programs: UpcomingProgram[] = [];

  for (const raw of items) {
    const item = raw as Partial<UpcomingProgram>;
    if (
      typeof item.id !== "number" ||
      typeof item.startTimestamp !== "number" ||
      typeof item.title !== "string" ||
      item.title.trim().length === 0
    ) {
      continue;
    }
    if (
      item.startTimestamp <= nowUtcSeconds ||
      item.startTimestamp > windowEndUtcSeconds
    ) {
      continue;
    }
    const key = `${item.id}-${item.startTimestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    programs.push({ id: item.id, startTimestamp: item.startTimestamp, title: item.title });
  }

  return programs;
}

function formatStartTime(startTimestamp: number): string {
  return new Date(startTimestamp * 1000).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: config.locutor.timezone,
  });
}

async function fetchUpcomingPrograms(): Promise<UpcomingProgram[]> {
  const nowUtcSeconds = Math.floor(Date.now() / 1000);
  const { data } = await azuracastApi.get(`/station/${STATION_ID}/schedule`, {
    params: { start: nowUtcSeconds, end: nowUtcSeconds + FETCH_WINDOW_SECONDS },
    timeout: 15_000,
  });
  return extractUpcomingPrograms(Array.isArray(data) ? data : []);
}

async function notifySubscribedDevices(program: UpcomingProgram): Promise<void> {
  const devices = await prisma.device.findMany({
    where: { subscriptions: { not: null }, fcmToken: { not: null } },
    select: { fcmToken: true, subscriptions: true },
  });

  const programNormalized = normalizeTitle(program.title);
  const tokens: string[] = [];

  for (const device of devices) {
    const isSubscribed = parseSubscriptions(device.subscriptions).some(
      (sub) => normalizeTitle(sub) === programNormalized
    );
    if (isSubscribed && device.fcmToken) {
      tokens.push(device.fcmToken);
    }
  }

  if (tokens.length === 0) return;

  const startTime = formatStartTime(program.startTimestamp);
  const result = await sendPushToTokens(tokens, {
    title: "Transmisión en vivo pronto",
    body: `El programa "${program.title}" empieza a las ${startTime}.`,
    data: {
      type: "program_start",
      programTitle: program.title,
      startTime,
    },
  });

  if (result.invalidTokens.length > 0) {
    await prisma.device.updateMany({
      where: { fcmToken: { in: result.invalidTokens } },
      data: { fcmToken: null },
    });
    logger.info("ProgramNotify", "Cleared invalid FCM tokens", {
      count: result.invalidTokens.length,
    });
  }

  logger.info("ProgramNotify", "Program notification sent", {
    program: program.title,
    sent: result.sent,
    failed: result.failed,
  });
}

/**
 * Notifies subscribed devices via FCM when a subscribed program is about to
 * start. Runs every 5 minutes and covers a 10-minute look-ahead window.
 * Deduplication is guaranteed by the unique (programId, startTimestamp)
 * constraint on ProgramNotification.
 */
export async function runProgramNotify(): Promise<void> {
  try {
    const programs = await fetchUpcomingPrograms();
    if (programs.length === 0) {
      await prisma.programNotification.deleteMany({
        where: { startTimestamp: { lt: new Date(Date.now() - RETENTION_DAYS * 86400_000) } },
      });
      return;
    }

    for (const program of programs) {
      try {
        await prisma.programNotification.create({
          data: {
            programId: String(program.id),
            startTimestamp: new Date(program.startTimestamp * 1000),
          },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") continue;
        throw err;
      }

      await notifySubscribedDevices(program);
    }
  } catch (err) {
    logger.error("ProgramNotify", "Run failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function registerProgramNotifyJob(): void {
  cron.schedule(
    CRON_SCHEDULE,
    () => {
      void runProgramNotify();
    },
    { timezone: config.locutor.timezone }
  );
}
