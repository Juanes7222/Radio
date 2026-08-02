import cron, { type ScheduledTask } from "node-cron";
import path from "path";
import fs from "fs/promises";
import { getTemplateForHour } from "./audioGeneration.service";
import { renderTemplate } from "./template.service";
import { synthesize, padSilenceTail, mixWithBed } from "./tts.service";
import { playFileAsLive } from "./streamer.service";
import { filterSafeHours } from "../schedule/analyzer.service";
import {
  playScheduledAnnouncementForHour,
  isLiveActive,
  disconnectLiveSource,
} from "../azuracast/playback.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

const TRAILING_SILENCE_SECONDS = 3;
const MINUTES_IN_HOUR = 60;
const HOURS_PER_DAY = 24;
const SCHEDULING_GRACE_MINUTES = 5;
const RESCHEDULE_RETRY_MS = 15 * 60 * 1000;
const LIVE_SWITCH_SETTLE_MS = 4000;
const LIVE_SWITCH_CHECK_ATTEMPTS = 2;
const STREAM_RETRY_DELAY_MS = 1500;

let activeTasks: ScheduledTask[] = [];
let planDateKey = "";
let rescheduleRetryTimer: NodeJS.Timeout | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function destroyActiveTasks(): void {
  for (const task of activeTasks) {
    task.destroy();
  }
  activeTasks = [];
}

function scheduleRescheduleRetry(): void {
  if (rescheduleRetryTimer) return;
  rescheduleRetryTimer = setTimeout(() => {
    rescheduleRetryTimer = null;
    rescheduleAnnouncements().catch((err) => {
      logger.error("PlaybackJob", "Reschedule retry failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, RESCHEDULE_RETRY_MS);
}

function pickRandomMinutes(count: number, gapMinutes: number): number[] {
  const minutes: number[] = [];
  let attempts = 0;

  while (minutes.length < count && attempts < 200) {
    attempts++;
    const candidate = Math.floor(Math.random() * MINUTES_IN_HOUR);
    if (minutes.some((m) => Math.abs(m - candidate) < gapMinutes)) continue;
    minutes.push(candidate);
  }

  return minutes.sort((a, b) => a - b);
}

interface AnnouncementSlot {
  hour: number;
  minute: number;
}

/**
 * Builds the announcement slots for the current day: for every safe
 * hour, N random minutes with a minimum separation, skipping any slot
 * that would fire within the scheduling grace period.
 */
function buildRandomSlots(
  safeHours: number[],
  perHour: number,
  gapMinutes: number
): AnnouncementSlot[] {
  const now = new Date();
  const nowTotalMinutes = now.getHours() * MINUTES_IN_HOUR + now.getMinutes();
  const slots: AnnouncementSlot[] = [];

  for (const hour of safeHours) {
    for (const minute of pickRandomMinutes(perHour, gapMinutes)) {
      const slotTotal = hour * MINUTES_IN_HOUR + minute;
      if (
        slotTotal > nowTotalMinutes &&
        slotTotal - nowTotalMinutes < SCHEDULING_GRACE_MINUTES
      ) {
        continue;
      }
      slots.push({ hour, minute });
    }
  }

  return slots;
}

/**
 * Recomputes the day plan from the AzuraCast schedule and re-registers
 * the cron tasks with fresh random times.
 */
export async function rescheduleAnnouncements(): Promise<void> {
  const allHours = Array.from({ length: HOURS_PER_DAY }, (_, i) => i);

  try {
    const safeHours = await filterSafeHours(allHours);

    if (safeHours.length === 0) {
      logger.warn("PlaybackJob", "No safe hours available, will retry later");
      scheduleRescheduleRetry();
      return;
    }

    const slots = buildRandomSlots(
      safeHours,
      config.locutor.announcementsPerHour,
      config.locutor.minAnnouncementGapMinutes
    );

    destroyActiveTasks();
    planDateKey = getDateKey(new Date());

    for (const { hour, minute } of slots) {
      const task = cron.schedule(
        `${minute} ${hour} * * *`,
        () => {
          playAnnouncement(hour).catch((err) => {
            logger.error("PlaybackJob", "Announcement handler failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        },
        { timezone: config.locutor.timezone }
      );
      activeTasks.push(task);
    }

    logger.info("PlaybackJob", "Scheduled random announcements", {
      planDate: planDateKey,
      safeHours,
      slotCount: slots.length,
      slots,
    });
  } catch (err) {
    logger.error("PlaybackJob", "Failed to reschedule announcements", {
      error: err instanceof Error ? err.message : String(err),
    });
    scheduleRescheduleRetry();
  }
}

async function playAnnouncement(hour: number): Promise<void> {
  if (getDateKey(new Date()) !== planDateKey) {
    logger.info("PlaybackJob", "Skipping stale slot from previous day", { hour });
    return;
  }

  const safeHours = await filterSafeHours([hour]);
  if (safeHours.length === 0) {
    logger.info("PlaybackJob", "Skipping announcement, hour became blocked", { hour });
    return;
  }

  const dynamicPlayed = await generateAndPlayNow();
  if (dynamicPlayed) return;

  const fallbackPlayed = await playScheduledAnnouncementForHour(hour);
  if (fallbackPlayed) {
    await verifyLiveSwitchBack();
    return;
  }

  logger.warn("PlaybackJob", "No announcement could be played", { hour });
}

/**
 * Synthesizes the announcement on the fly, mixes it over a random
 * instrumental bed (or pads it with silence when no bed is available),
 * streams it to the live mount and cleans up the temp files.
 */
async function generateAndPlayNow(): Promise<boolean> {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  try {
    const template = await getTemplateForHour(currentHour);

    const renderedText = renderTemplate(template.textTemplate, {
      hour: String(currentHour % 12 || 12),
      hour24: String(currentHour),
      minutes: String(currentMinute).padStart(2, "0"),
    });

    const filename = `hora_${String(currentHour).padStart(2, "0")}_${String(currentMinute).padStart(2, "0")}_${Date.now()}.mp3`;
    const filepath = path.join(config.locutor.mediaDir, filename);

    const { duration_ms } = await synthesize({
      text: renderedText,
      voice: template.voice,
      speed: template.speed,
      outputPath: filepath,
    });

    logger.info("PlaybackJob", "Generated dynamic announcement", {
      hour: currentHour,
      minute: currentMinute,
      text: renderedText,
      durationMs: duration_ms,
    });

    const playablePath = await preparePlayableFile(filepath, duration_ms);

    await playFileWithRetry(playablePath);
    await verifyLiveSwitchBack();

    await fs.unlink(filepath).catch(() => {});
    if (playablePath !== filepath) {
      await fs.unlink(playablePath).catch(() => {});
    }

    logger.info("PlaybackJob", "Dynamic announcement played", {
      hour: currentHour,
      minute: currentMinute,
    });

    return true;
  } catch (err) {
    logger.error("PlaybackJob", "Failed to generate and play announcement", {
      hour: currentHour,
      minute: currentMinute,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function pickRandomBed(bedsDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(bedsDir);
    const beds = entries.filter((name) => /\.(mp3|ogg|m4a|wav)$/i.test(name));
    if (beds.length === 0) return null;
    return path.join(bedsDir, beds[Math.floor(Math.random() * beds.length)]);
  } catch {
    return null;
  }
}

/**
 * Prepares the file that will be streamed: voice over a random bed
 * when available, silence-padded otherwise. Falls back to the raw
 * voice file if both preparations fail.
 */
async function preparePlayableFile(filepath: string, durationMs: number): Promise<string> {
  const outputPath = path.join(
    config.locutor.mediaDir,
    `playable_${Date.now()}_${path.basename(filepath)}`
  );

  try {
    const bedPath = await pickRandomBed(config.locutor.bedsDir);

    if (bedPath) {
      await mixWithBed({
        voicePath: filepath,
        bedPath,
        outputPath,
        durationSeconds: durationMs / 1000,
        bedVolume: config.locutor.bedVolume,
        tailSeconds: TRAILING_SILENCE_SECONDS,
      });
      logger.info("PlaybackJob", "Mixed announcement with instrumental bed", {
        bedPath,
        outputPath,
      });
      return outputPath;
    }

    await padSilenceTail(filepath, outputPath, TRAILING_SILENCE_SECONDS);
    logger.info("PlaybackJob", "No beds available, padded announcement with silence", {
      outputPath,
    });
    return outputPath;
  } catch (err) {
    logger.warn("PlaybackJob", "Failed to prepare playable file, playing raw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return filepath;
  }
}

function isRetryableConnectionError(err: unknown): boolean {
  const error = err as NodeJS.ErrnoException & { message?: string };
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return (
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE"].includes(code) ||
    /timeout|conexion rechazada/i.test(message)
  );
}

async function playFileWithRetry(filePath: string): Promise<void> {
  try {
    await playFileAsLive(filePath);
  } catch (firstErr) {
    if (!isRetryableConnectionError(firstErr)) throw firstErr;

    logger.warn("PlaybackJob", "Retrying announcement stream", {
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });
    await sleep(STREAM_RETRY_DELAY_MS);
    await playFileAsLive(filePath);
  }
}

/**
 * After the announcement socket closes, Liquidsoap should switch back
 * to the auto-DJ. If the live flag stays set, the switch is stuck and
 * the station would be silent: log it and kick the live source.
 */
async function verifyLiveSwitchBack(): Promise<void> {
  await sleep(LIVE_SWITCH_SETTLE_MS);

  for (let attempt = 0; attempt < LIVE_SWITCH_CHECK_ATTEMPTS; attempt++) {
    const liveActive = await isLiveActive();
    if (!liveActive) return;
    await sleep(LIVE_SWITCH_SETTLE_MS);
  }

  logger.error("PlaybackJob", "Live switch stuck after announcement, disconnecting live source");
  await disconnectLiveSource();
}

export function registerPlaybackJob() {
  rescheduleAnnouncements().catch((err) => {
    logger.error("PlaybackJob", "Initial reschedule failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  cron.schedule(
    "1 0 * * *",
    () => {
      rescheduleAnnouncements().catch((err) => {
        logger.error("PlaybackJob", "Daily reschedule failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
    { timezone: config.locutor.timezone }
  );

  logger.info("PlaybackJob", "Random announcement scheduler registered");
}
