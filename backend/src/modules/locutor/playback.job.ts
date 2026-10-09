import cron, { type ScheduledTask } from "node-cron";
import path from "path";
import fs from "fs/promises";
import { prisma } from "../../infrastructure/database/prisma";
import { renderTemplate, getTemplateForHour } from "./template.service";
import { synthesize, padSilenceTail, mixWithBed } from "./tts.service";
import { playFileAsLive, isOwnAnnouncementLive } from "./streamer.service";
import { evaluateLiveState } from "./liveState.service";
import { replanAnnouncements } from "./announcementPlan.service";
import { getSettings } from "./settings.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";

/**
 * Ejecución de los avisos de hora.
 *
 * El plan se limita a proponer slots. Cada slot se decide en vivo al momento
 * de ocurrir, y esa decisión es lo que permite cumplir la regla de no
 * interrumpir ningún programa cuando estos no respetan el horario: si una
 * predica termina antes de lo previsto, el estado en vivo deja pasar el aviso;
 * si se alarga, el aviso se difiere en lugar de emitirse encima.
 */

const STREAM_RETRY_DELAY_MS = 1500;
const REPLAN_INTERVAL_MINUTES = 15;

let activeTasks: ScheduledTask[] = [];
let planDateKey = "";
let replanInterval: NodeJS.Timeout | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getDateKey(date: Date): string {
  return getStationTime(date).dayKey;
}

function destroyActiveTasks(): void {
  for (const task of activeTasks) {
    task.destroy();
  }
  activeTasks = [];
}

/**
 * Reconstruye el plan y vuelve a registrar los cron de cada slot. Se llama al
 * arranque, al comenzar el día y de forma periódica, porque un programa que
 * termina antes de lo previsto libera horas que el plan anterior descartó.
 */
export async function rescheduleAnnouncements(date: Date = new Date()): Promise<number> {
  const settings = await getSettings();
  const slotCount = await replanAnnouncements(date);

  destroyActiveTasks();
  planDateKey = getDateKey(new Date());

  if (!settings.enabled || slotCount === 0) {
    logger.info("PlaybackJob", "No announcement slots registered", {
      enabled: settings.enabled,
      slotCount,
    });
    return slotCount;
  }

  const slots = await prisma.announcementSlot.findMany({
    where: { planDate: planDateKey, status: "pending" },
    orderBy: { minuteOfDay: "asc" },
  });

  for (const slot of slots) {
    const minute = slot.minuteOfDay;
    const task = cron.schedule(
      `${minute % 60} ${Math.floor(minute / 60)} * * *`,
      () => {
        runSlot(slot.id).catch((err) => {
          logger.error("PlaybackJob", "Slot handler failed", {
            slotId: slot.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      },
      { timezone: settings.timezone }
    );
    activeTasks.push(task);
  }

  logger.info("PlaybackJob", "Announcement slots registered", {
    planDate: planDateKey,
    slotCount: slots.length,
  });

  return slots.length;
}

async function recordRun(
  slotId: string | null,
  outcome: string,
  detail?: string,
  extra?: { playingPlaylist?: string | null; liveStreamer?: string | null; durationMs?: number }
): Promise<void> {
  await prisma.announcementRunLog.create({
    data: {
      slotId,
      outcome,
      detail: detail ?? null,
      playingPlaylist: extra?.playingPlaylist ?? null,
      liveStreamer: extra?.liveStreamer ?? null,
      durationMs: extra?.durationMs ?? null,
    },
  });
}

/**
 * Decide y ejecuta un slot. Si el estado en vivo impide emitir, el slot se
 * difiere y se reevalúa más adelante en lugar de perderse. Al agotar los
 * intentos queda registrado como descartado con su motivo, para que el operador
 * pueda ver por qué no sonó esa hora concreta.
 */
async function runSlot(slotId: string): Promise<void> {
  const settings = await getSettings();

  if (!settings.enabled) {
    await settleSlot(slotId, "skipped", "Deshabilitado desde el panel");
    return;
  }

  const slot = await prisma.announcementSlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.status !== "pending" && slot.status !== "deferred") {
    logger.info("PlaybackJob", "Slot already settled", { slotId, status: slot?.status });
    return;
  }

  if (slot.planDate !== getDateKey(new Date())) {
    await settleSlot(slotId, "skipped", "Plan de un día anterior");
    return;
  }

  const verdict = await evaluateLiveState({
    respectLiveStreamer: settings.respectLiveStreamer,
    respectScheduledPrograms: settings.respectScheduledPrograms,
  });

  if (!verdict.allowed) {
    const nextRetry = slot.retryCount + 1;

    await recordRun(slotId, `blocked_${verdict.reason}`, verdict.detail, {
      playingPlaylist: verdict.playingPlaylist,
      liveStreamer: verdict.liveStreamer,
    });

    if (verdict.reason === "unknown") {
      // Un fallo de red no es motivo para convertir el slot en reintento: se
      // descarta, porque no se puede afirmar que la ventana siga libre.
      await settleSlot(slotId, "failed", verdict.detail);
      return;
    }

    if (nextRetry > settings.maxRetries) {
      await settleSlot(
        slotId,
        "skipped",
        `${verdict.detail} (agotados ${settings.maxRetries} reintentos)`
      );
      return;
    }

    await prisma.announcementSlot.update({
      where: { id: slotId },
      data: {
        status: "deferred",
        reason: verdict.detail,
        retryCount: nextRetry,
      },
    });

    scheduleRetry(slotId, settings.retryIntervalMinutes * 60_000);
    logger.info("PlaybackJob", "Slot deferred", {
      slotId,
      reason: verdict.reason,
      retry: nextRetry,
      ofMax: settings.maxRetries,
    });
    return;
  }

  const played = await generateAndPlayNow();
  const outcome = played ? "played" : "failed";
  const reason = played ? "Reproducido" : "No se pudo generar o reproducir el aviso";

  // The bitácora is the audit trail for why an hour went unannounced, so the
  // terminal states belong in it too. Recording only the blocked attempts left
  // the table empty in exactly the case that matters most: the station was free,
  // the notice was allowed to air, and it never sounded.
  await recordRun(slotId, outcome, reason);
  await settleSlot(slotId, outcome, reason);
}

function scheduleRetry(slotId: string, delayMs: number): void {
  setTimeout(() => {
    runSlot(slotId).catch((err) => {
      logger.error("PlaybackJob", "Deferred slot failed", {
        slotId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, delayMs);
}

async function settleSlot(slotId: string, status: string, reason: string): Promise<void> {
  await prisma.announcementSlot.update({
    where: { id: slotId },
    data: {
      status,
      reason,
      settledAt: new Date(),
      ...(status === "played" ? { playedAt: new Date() } : {}),
    },
  });
}

/**
 * Sintetiza el aviso, lo mezcla sobre una base instrumental y lo transmite por
 * el harbor de Liquidsoap como fuente en vivo.
 */
async function generateAndPlayNow(): Promise<boolean> {
  const now = getStationTime();
  const currentHour = now.hour;
  const currentMinute = now.minute;
  const settings = await getSettings();

  try {
    const template = await getTemplateForHour(currentHour);

    const renderedText = renderTemplate(template.textTemplate, {
      hour24: currentHour,
      minutes: currentMinute,
    });

    const filename = `hora_${String(currentHour).padStart(2, "0")}_${String(currentMinute).padStart(2, "0")}_${Date.now()}.mp3`;
    const filepath = path.join(config.locutor.mediaDir, filename);

    const synthesis = await synthesize({
      text: renderedText,
      voice: template.voice,
      speed: template.speed,
      outputPath: filepath,
    });

    logger.info("PlaybackJob", "Generated dynamic announcement", {
      hour: currentHour,
      minute: currentMinute,
      text: renderedText,
      provider: synthesis.provider,
      durationMs: synthesis.durationMs,
    });

    const playablePath = await preparePlayableFile(filepath, synthesis.durationMs, settings);

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
 * Prepara el archivo que se transmite: voz sobre una base aleatoria cuando hay
 * una disponible, o con silencio añadido al final en caso contrario.
 */
async function preparePlayableFile(
  filepath: string,
  durationMs: number,
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<string> {
  const outputPath = path.join(
    config.locutor.mediaDir,
    `playable_${Date.now()}_${path.basename(filepath)}`
  );

  try {
    const bedPath = await pickRandomBed(settings.bedsDir);

    if (bedPath) {
      await mixWithBed({
        voicePath: filepath,
        bedPath,
        outputPath,
        durationSeconds: durationMs / 1000,
        bedVolume: settings.bedVolume,
        tailSeconds: settings.trailingSilenceSeconds,
      });
      logger.info("PlaybackJob", "Mixed announcement with instrumental bed", { bedPath });
      return outputPath;
    }

    await padSilenceTail(filepath, outputPath, settings.trailingSilenceSeconds);
    logger.info("PlaybackJob", "No beds available, padded announcement with silence", {
      bedsDir: settings.bedsDir,
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
 * Tras cerrar el socket, Liquidsoap debe volver al AutoDJ. Si el live se
 * queda activo hay que distinguir dos causas opuestas.
 *
 * El caso peligroso es que un humano haya conectado: la versión anterior
 * llamaba a disconnectLiveSource() sin mirar quién estaba al aire, y eso le
 * cortaba la señal a un DJ y le soltaba el backend. Ahora solo se desconecta
 * cuando el live sigue siendo el propio sistema de anuncios; si hay una
 * persona, el aviso se detiene y se avisa por log para que un humano lo corte
 * desde el panel.
 */
async function verifyLiveSwitchBack(): Promise<void> {
  const settleMs = 4000;

  await sleep(settleMs);

  for (let attempt = 0; attempt < 2; attempt++) {
    const live = await isOwnAnnouncementLive();
    if (!live.active) return;
    await sleep(settleMs);
  }

  const live = await isOwnAnnouncementLive();
  if (!live.active) return;

  if (live.humanStreamer) {
    logger.error(
      "PlaybackJob",
      "Human streamer took over during the announcement, leaving the live source untouched",
      { humanStreamer: live.humanStreamer }
    );
    return;
  }

  logger.warn("PlaybackJob", "Live switch stuck after announcement, disconnecting own source");
  const { disconnectLiveSource } = await import("../azuracast/playback.service");
  await disconnectLiveSource();
}

function startReplanLoop(): void {
  if (replanInterval) clearInterval(replanInterval);
  replanInterval = setInterval(() => {
    rescheduleAnnouncements().catch((err) => {
      logger.error("PlaybackJob", "Periodic reschedule failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, REPLAN_INTERVAL_MINUTES * 60_000);
}

export function registerPlaybackJob(): void {
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

  startReplanLoop();

  logger.info("PlaybackJob", "Announcement scheduler registered", {
    replanIntervalMinutes: REPLAN_INTERVAL_MINUTES,
  });
}
