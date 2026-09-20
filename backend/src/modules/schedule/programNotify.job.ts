import cron from "node-cron";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { prisma } from "../../infrastructure/database/prisma";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { describeError } from "../../shared/utils/errors";

/**
 * FCM sees a traffic peak in the minutes around :00, :15, :30 and :45. A
 * 5-minute grid cannot dodge every window, but starting at :01 avoids the
 * exact peaks.
 */
const CRON_SCHEDULE = "1-56/5 * * * *";
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

type DeliveryOutcome = "delivered" | "no_subscribers" | "delivery_failed";

/** Counters of one run, logged and returned to the admin job runner. */
export interface ProgramNotifySummary {
  programs: number;
  notified: number;
  skipped: number;
  failed: number;
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

async function notifySubscribedDevices(program: UpcomingProgram): Promise<DeliveryOutcome> {
  const devices = await prisma.device.findMany({
    where: {
      subscriptions: { not: null },
      fcmToken: { not: null },
      // Devices that schedule the reminder locally are skipped: pushing them
      // too would show the same reminder twice. Devices created before the
      // column existed stay NULL and keep receiving the server push.
      OR: [{ localRemindersEnabled: null }, { localRemindersEnabled: false }],
    },
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

  // Distinguishing "nobody subscribed" from "delivery failed" is what makes a
  // silent reminder explainable: the first is normal, the second is a bug.
  if (tokens.length === 0) {
    logger.info("ProgramNotify", "No subscribed device for program", {
      program: program.title,
      candidateDevices: devices.length,
    });
    return "no_subscribers";
  }

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

  // Firebase disabled or a batch-level error reports zero attempts with at
  // least one token, which is never a successful delivery.
  if (result.sent === 0) {
    logger.error("ProgramNotify", "Program push not delivered", {
      program: program.title,
      tokens: tokens.length,
      failed: result.failed,
    });
    return "delivery_failed";
  }

  logger.info("ProgramNotify", "Program notification sent", {
    program: program.title,
    sent: result.sent,
    failed: result.failed,
  });
  return "delivered";
}

/**
 * Notifies subscribed devices via FCM when a subscribed program is about to
 * start. The app schedules these reminders locally whenever it can, so this
 * push is the fallback for devices that cannot (no display permission, app not
 * opened for days), which is why devices reporting local reminders are skipped.
 * Runs every 5 minutes and covers a 10-minute look-ahead window. Deduplication
 * is guaranteed by the unique (programId, startTimestamp) constraint on
 * ProgramNotification. The row is released again when the push was not
 * delivered, so a temporary FCM failure does not swallow the reminder.
 */
export async function runProgramNotify(): Promise<ProgramNotifySummary> {
  const summary: ProgramNotifySummary = {
    programs: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    const programs = await fetchUpcomingPrograms();
    summary.programs = programs.length;

    if (programs.length === 0) {
      await prisma.programNotification.deleteMany({
        where: { startTimestamp: { lt: new Date(Date.now() - RETENTION_DAYS * 86400_000) } },
      });
      return summary;
    }

    for (const program of programs) {
      const startTimestamp = new Date(program.startTimestamp * 1000);

      try {
        await prisma.programNotification.create({
          data: {
            programId: String(program.id),
            startTimestamp,
          },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") {
          summary.skipped += 1;
          continue;
        }
        throw err;
      }

      const outcome = await notifySubscribedDevices(program);
      if (outcome !== "delivery_failed") {
        summary.notified += 1;
        continue;
      }

      summary.failed += 1;
      await prisma.programNotification.deleteMany({
        where: { programId: String(program.id), startTimestamp },
      });
    }

    logger.info("ProgramNotify", "Run finished", { ...summary });
  } catch (err) {
    logger.error("ProgramNotify", "Run failed", describeError(err));
  }

  return summary;
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
