import cron from "node-cron";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { prisma } from "../../infrastructure/database/prisma";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { describeError } from "../../shared/utils/errors";

const CRON_SCHEDULE = "*/5 * * * *";
const LOOK_AHEAD_SECONDS = 10 * 60;
/** Margin added to the requested window to absorb clock drift. */
const REQUEST_MARGIN_SECONDS = 30 * 60;
const RETENTION_DAYS = 7;

/** Raw AzuraCast schedule item, snake_case as returned by the API. */
interface AzuraScheduleItem {
  id: number;
  start_timestamp: number;
  title: string;
}

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

function extractUpcomingPrograms(items: unknown[]): UpcomingProgram[] {
  const nowUtcSeconds = Math.floor(Date.now() / 1000);
  const windowEndUtcSeconds = nowUtcSeconds + LOOK_AHEAD_SECONDS;
  const seen = new Set<string>();
  const programs: UpcomingProgram[] = [];

  for (const raw of items) {
    const item = raw as Partial<AzuraScheduleItem>;
    if (
      typeof item.id !== "number" ||
      typeof item.start_timestamp !== "number" ||
      typeof item.title !== "string" ||
      item.title.trim().length === 0
    ) {
      continue;
    }
    if (
      item.start_timestamp <= nowUtcSeconds ||
      item.start_timestamp > windowEndUtcSeconds
    ) {
      continue;
    }
    const key = `${item.id}-${item.start_timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    programs.push({
      id: item.id,
      startTimestamp: item.start_timestamp,
      title: item.title,
    });
  }

  return programs;
}

/**
 * AzuraCast answers with snake_case schedule fields. A non-empty payload
 * without them means the API contract changed, and the job would silently
 * notify nobody: fail loudly instead.
 */
function warnOnUnexpectedPayload(items: unknown[]): void {
  if (items.length === 0) return;

  const hasTimestamp = items.some(
    (item) => typeof (item as Partial<AzuraScheduleItem>).start_timestamp === "number"
  );
  if (hasTimestamp) return;

  logger.error("ProgramNotify", "AzuraCast schedule payload has no start_timestamp field", {
    items: items.length,
    sampleKeys: Object.keys(items[0] as Record<string, unknown>).slice(0, 12),
  });
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
  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + (LOOK_AHEAD_SECONDS + REQUEST_MARGIN_SECONDS) * 1000
  );

  const { data } = await azuracastApi.get(`/station/${STATION_ID}/schedule`, {
    params: {
      start: now.toISOString(),
      end: windowEnd.toISOString(),
    },
    timeout: 15_000,
  });

  const items = Array.isArray(data) ? data : [];
  warnOnUnexpectedPayload(items);
  return extractUpcomingPrograms(items);
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
    logger.error("ProgramNotify", "Run failed", describeError(err));
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
