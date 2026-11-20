import cron from "node-cron";
import path from "path";
import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import type { AnnouncementSlot, Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma";
import { renderAnnouncementTemplate, getTemplateForHour } from "./template.service";
import { synthesize, padSilenceTail, mixWithBed, type SynthesizeResult } from "./tts.service";
import { playFileAsLive } from "./streamer.service";
import { evaluateLiveState, type LiveVerdict } from "./liveState.service";
import { getDayAnalysis, replanAnnouncements } from "./announcementPlan.service";
import { getSettings, type AnnouncementSettings } from "./settings.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";

const MINUTE_MS = 60_000;
const SLOT_GRACE_MS = 90_000;
const VOICE_LEAD_SECONDS = 0.8;
const CONNECTION_ALLOWANCE_SECONDS = 5;

let rescheduling: Promise<number> | undefined;

export async function rescheduleAnnouncements(): Promise<number> {
  rescheduling ??= replanAnnouncements().finally(() => { rescheduling = undefined; });
  return rescheduling;
}

export class AnnouncementBlockedError extends Error {
  constructor(
    readonly outcome: string,
    detail: string,
    readonly verdict?: LiveVerdict
  ) {
    super(detail);
  }
}

interface PlayedAnnouncement extends SynthesizeResult {
  hour: number;
  minute: number;
  text: string;
}

async function assertLiveWindow(settings: AnnouncementSettings): Promise<void> {
  const verdict = await evaluateLiveState(settings);
  if (!verdict.allowed) {
    throw new AnnouncementBlockedError(`blocked_${verdict.reason}`, verdict.detail, verdict);
  }
}

async function pickRandomBed(bedsDir: string): Promise<string | undefined> {
  const entries = await readdir(bedsDir, { withFileTypes: true }).catch(() => []);
  const beds = entries.filter((entry) => entry.isFile() && /\.(mp3|ogg|m4a|wav)$/i.test(entry.name));
  if (beds.length > 0) return path.join(bedsDir, beds[Math.floor(Math.random() * beds.length)].name);
}

async function preparePlayableFile(
  voicePath: string,
  outputPath: string,
  durationMs: number,
  settings: AnnouncementSettings
): Promise<number> {
  const tailSeconds = config.locutor.harborBufferSeconds + settings.trailingSilenceSeconds;
  const bedPath = await pickRandomBed(settings.bedsDir);
  if (bedPath) {
    try {
      await mixWithBed({
        voicePath,
        bedPath,
        outputPath,
        durationSeconds: durationMs / 1000,
        bedVolume: settings.bedVolume,
        tailSeconds,
        leadSeconds: VOICE_LEAD_SECONDS,
      });
      return durationMs + (tailSeconds + VOICE_LEAD_SECONDS) * 1000;
    } catch (error) {
      logger.warn("PlaybackJob", "Could not mix the announcement bed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await padSilenceTail(voicePath, outputPath, tailSeconds, VOICE_LEAD_SECONDS);
  return durationMs + (tailSeconds + VOICE_LEAD_SECONDS) * 1000;
}

export async function playAnnouncement(
  settings: AnnouncementSettings,
  requestedHour?: number
): Promise<PlayedAnnouncement> {
  await assertLiveWindow(settings);

  const directory = await mkdtemp(path.join(tmpdir(), "radio-locutor-"));
  try {
    const startedAt = new Date();
    const stationTime = getStationTime(startedAt, settings.timezone);
    const { minute } = stationTime;
    const hour = requestedHour ?? stationTime.hour;
    const template = await getTemplateForHour(hour, minute, stationTime);
    const text = renderAnnouncementTemplate(template, { hour24: hour, minutes: minute }, stationTime);
    const voicePath = path.join(directory, "voice.mp3");
    const playablePath = path.join(directory, "announcement.mp3");
    const minuteEndsAt = (Math.floor(startedAt.getTime() / MINUTE_MS) + 1) * MINUTE_MS;
    const airDelayMs = (config.locutor.harborBufferSeconds + VOICE_LEAD_SECONDS + CONNECTION_ALLOWANCE_SECONDS) * 1000;
    const synthesisBudgetMs = Math.min(42_000, minuteEndsAt - Date.now() - airDelayMs);

    if (synthesisBudgetMs < 1000) {
      throw new AnnouncementBlockedError("blocked_clock", "El minuto está por cambiar antes de locutar");
    }

    const synthesis = await synthesize({
      text,
      voice: template.voice,
      speed: template.speed,
      outputPath: voicePath,
      primarySignal: AbortSignal.timeout(Math.floor(synthesisBudgetMs * 0.65)),
      signal: AbortSignal.timeout(synthesisBudgetMs),
    });
    const durationMs = await preparePlayableFile(voicePath, playablePath, synthesis.durationMs, settings);

    await playFileAsLive(playablePath, durationMs, async () => {
      const checkedAt = new Date();
      const latestSettings = await getSettings();
      if (requestedHour === undefined && !latestSettings.enabled) {
        throw new AnnouncementBlockedError("blocked_disabled", "Avisos deshabilitados desde el panel");
      }

      const analysis = latestSettings.respectScheduledPrograms
        ? await getDayAnalysis(checkedAt, latestSettings)
        : null;
      await assertLiveWindow(latestSettings);
      const readyAt = new Date();
      if (analysis) {
        if (analysis.degraded) {
          throw new AnnouncementBlockedError("blocked_unknown", "No se pudo confirmar la programación antes de emitir");
        }

        const time = getStationTime(readyAt, latestSettings.timezone);
        const minuteOfDay = time.hour * 60 + time.minute + (readyAt.getTime() % MINUTE_MS) / MINUTE_MS;
        const endsAt = minuteOfDay + (durationMs / 1000 + CONNECTION_ALLOWANCE_SECONDS) / 60;
        const fits = analysis.freeWindows.some((window) =>
          minuteOfDay >= window.startMinute && endsAt <= window.endMinute
        );
        if (time.dayKey !== analysis.dayKey || !fits) {
          throw new AnnouncementBlockedError("blocked_scheduled_program", "El aviso no cabe en una ventana libre de la programación");
        }
      }

      if (latestSettings.timezone !== settings.timezone || readyAt.getTime() + airDelayMs >= minuteEndsAt) {
        throw new AnnouncementBlockedError("blocked_clock", "La hora cambió durante la preparación del aviso");
      }
    });

    return { ...synthesis, hour, minute, text };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch((error: unknown) => {
      logger.warn("PlaybackJob", "Could not remove the temporary announcement", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

async function runSlot(slot: AnnouncementSlot, settings: AnnouncementSettings): Promise<void> {
  const claim = await prisma.announcementSlot.updateMany({
    where: { id: slot.id, status: slot.status },
    data: { status: "running", retryAt: new Date() },
  });
  if (claim.count === 0) return;

  let outcome = "streamed";
  let detail: string;
  let slotUpdate: Prisma.AnnouncementSlotUpdateInput;
  let verdict: LiveVerdict | undefined;
  let durationMs: number | undefined;

  try {
    const cutoff = new Date(Date.now() - settings.minGapMinutes * MINUTE_MS);
    const recent = await prisma.announcementSlot.findFirst({
      where: { status: "played", playedAt: { gt: cutoff } },
      select: { id: true },
    });
    if (recent) throw new AnnouncementBlockedError("blocked_gap", "Todavía no se cumple la separación mínima entre avisos");

    const played = await playAnnouncement(settings);
    durationMs = played.durationMs;
    const clock = `${String(played.hour).padStart(2, "0")}:${String(played.minute).padStart(2, "0")}`;
    const provider = played.provider === "elevenlabs" ? "ElevenLabs" : "Kokoro";
    detail = `${clock} · ${provider} · ${played.text}`;
    const now = new Date();
    slotUpdate = { status: "played", playedAt: now, settledAt: now };
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
    if (error instanceof AnnouncementBlockedError) {
      outcome = error.outcome;
      verdict = error.verdict;
      const retryAt = new Date(Date.now() + settings.retryIntervalMinutes * MINUTE_MS);
      const canRetry = outcome !== "blocked_disabled" && slot.retryCount < settings.maxRetries &&
        getStationTime(retryAt, settings.timezone).dayKey === slot.planDate;
      slotUpdate = canRetry
        ? { status: "deferred", retryAt, retryCount: { increment: 1 } }
        : { status: "skipped", settledAt: new Date() };
    } else {
      outcome = "failed";
      slotUpdate = { status: "failed", settledAt: new Date() };
    }
  }

  await prisma.announcementSlot.update({
    where: { id: slot.id },
    data: {
      ...slotUpdate,
      reason: detail,
      runs: { create: {
        outcome,
        detail,
        durationMs,
        playingPlaylist: verdict?.playingPlaylist,
        liveStreamer: verdict?.liveStreamer,
      } },
    },
  });
}

export async function runDueAnnouncements(now = new Date()): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const { dayKey } = getStationTime(now, settings.timezone);
  const cutoff = new Date(now.getTime() - SLOT_GRACE_MS);
  const staleRunCutoff = new Date(now.getTime() - 5 * MINUTE_MS);
  await prisma.announcementSlot.updateMany({
    where: {
      OR: [
        { status: { in: ["pending", "deferred"] }, planDate: { lt: dayKey } },
        { status: "pending", planDate: dayKey, plannedFor: { lt: cutoff } },
        {
          status: "running",
          OR: [
            { retryAt: { lt: staleRunCutoff } },
            { retryAt: null, plannedFor: { lt: staleRunCutoff } },
          ],
        },
      ],
    },
    data: { status: "skipped", reason: "Venció la ventana de ejecución del aviso", settledAt: now },
  });

  const slot = await prisma.announcementSlot.findFirst({
    where: {
      planDate: dayKey,
      OR: [
        { status: "pending", plannedFor: { gte: cutoff, lte: now } },
        { status: "deferred", retryAt: { lte: now } },
        { status: "deferred", retryAt: null, plannedFor: { lte: now } },
      ],
    },
    orderBy: [{ retryAt: "asc" }, { plannedFor: "asc" }],
  });

  if (slot) await runSlot(slot, settings);
}

export function registerPlaybackJob(): void {
  const reportError = (error: unknown): void => {
    logger.error("PlaybackJob", "Announcement scheduler failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  };

  void rescheduleAnnouncements().catch(reportError);
  cron.schedule("* * * * *", () => runDueAnnouncements().catch(reportError), { noOverlap: true });
  cron.schedule("*/15 * * * *", () => rescheduleAnnouncements().then(() => {}).catch(reportError), {
    noOverlap: true,
  });
}
