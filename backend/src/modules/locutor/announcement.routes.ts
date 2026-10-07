import { Router, type Request, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { getSettings, toPublicSettings, updateSettings } from "./settings.service";
import { buildPlan, getDayAnalysis, replanAnnouncements } from "./announcementPlan.service";
import { evaluateLiveState, fetchScheduledPlaylistNames } from "./liveState.service";
import { rescheduleAnnouncements } from "./playback.job";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";

/**
 * Administración de los avisos de hora: configuración, plan del día, estado en
 * vivo y bitácora. Todo lo que el job usa como decisión pasa por aquí, para que
 * el operador pueda ver y cambiar el comportamiento sin tocar código.
 */

const router = Router();
router.use(requireAuth, requirePermission("locutor"));

function minuteToClock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Configuración actual. La contraseña del streamer nunca se expone. */
router.get("/settings", async (_req: Request, res: Response) => {
  const settings = await getSettings();
  res.json(toPublicSettings(settings));
});

/** Actualización parcial: solo toca los campos presentes en el cuerpo. */
router.put("/settings", async (req: Request, res: Response) => {
  const updated = await updateSettings(req.body ?? {});
  res.json(toPublicSettings(updated));
});

/**
 * Estado en vivo de la estación y veredicto sobre si se emitiría un aviso
 * ahora. Es la pantalla que explica por qué una hora no sonó.
 */
router.get("/live-state", async (_req: Request, res: Response) => {
  const settings = await getSettings();
  const verdict = await evaluateLiveState({
    respectLiveStreamer: settings.respectLiveStreamer,
    respectScheduledPrograms: settings.respectScheduledPrograms,
  });
  const analysis = await getDayAnalysis();

  res.json({
    wouldAnnounceNow: verdict.allowed,
    reason: verdict.reason,
    detail: verdict.detail,
    liveStreamer: verdict.liveStreamer,
    playingPlaylist: verdict.playingPlaylist,
    degraded: verdict.degraded,
    scheduledProgram: analysis.currentProgram,
    stationTime: {
      dayKey: analysis.dayKey,
      clock: minuteToClock(getStationTime().hour * 60 + getStationTime().minute),
    },
  });
});

/**
 * Análisis del día: ventanas libres, intervalos ocupados y minutos
 * disponibles. Permite entender de inmediato si la configuración deja espacio
 * suficiente antes de esperar a que suene.
 */
router.get("/day-analysis", async (_req: Request, res: Response) => {
  const analysis = await getDayAnalysis();

  res.json({
    dayKey: analysis.dayKey,
    degraded: analysis.degraded,
    freeMinutes: analysis.freeMinutes,
    currentProgram: analysis.currentProgram,
    freeWindows: analysis.freeWindows.map((window) => ({
      from: minuteToClock(window.startMinute),
      to: minuteToClock(window.endMinute),
      minutes: window.endMinute - window.startMinute,
    })),
    busyIntervals: analysis.busyIntervals.map((interval) => ({
      from: minuteToClock(interval.startMinute),
      to: minuteToClock(interval.endMinute),
      title: interval.title,
    })),
  });
});

/** Playlists con horario asignado: las que bloquean avisos mientras suenan. */
router.get("/scheduled-playlists", async (_req: Request, res: Response) => {
  const names = await fetchScheduledPlaylistNames();
  res.json({ playlists: [...names].sort() });
});

/**
 * Plan propuesto para hoy sin persistirlo. Sirve para previsualizar el efecto
 * de un cambio de configuración sin alterar los slots en curso.
 */
router.get("/plan/preview", async (_req: Request, res: Response) => {
  const plan = await buildPlan();

  res.json({
    dayKey: plan.dayKey,
    slotCount: plan.slots.length,
    droppedByGap: plan.droppedByGap,
    freeMinutes: plan.analysis.freeMinutes,
    freeWindows: plan.analysis.freeWindows.length,
    degraded: plan.analysis.degraded,
    slots: plan.slots.map((slot) => ({
      at: minuteToClock(slot.minuteOfDay),
      minuteOfDay: slot.minuteOfDay,
      plannedFor: slot.plannedFor.toISOString(),
    })),
  });
});

/** Slots persistidos de un día, con su estado. */
router.get("/plan/slots", async (req: Request, res: Response) => {
  const date = typeof req.query.date === "string" ? req.query.date.trim() : "";
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getStationTime().dayKey;

  const slots = await prisma.announcementSlot.findMany({
    where: { planDate: dayKey },
    orderBy: { minuteOfDay: "asc" },
  });

  res.json({
    dayKey,
    slots: slots.map((slot) => ({
      id: slot.id,
      at: minuteToClock(slot.minuteOfDay),
      status: slot.status,
      reason: slot.reason,
      retryCount: slot.retryCount,
      playedAt: slot.playedAt?.toISOString() ?? null,
      settledAt: slot.settledAt?.toISOString() ?? null,
    })),
  });
});

/** Reintentos de los últimos días: la explicación de cada hora perdida. */
router.get("/run-log", async (req: Request, res: Response) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));

  const rows = await prisma.announcementRunLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { slot: { select: { minuteOfDay: true, planDate: true } } },
  });

  res.json(
    rows.map((row) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      outcome: row.outcome,
      detail: row.detail,
      playingPlaylist: row.playingPlaylist,
      liveStreamer: row.liveStreamer,
      plannedFor: row.slot ? minuteToClock(row.slot.minuteOfDay) : null,
      planDate: row.slot?.planDate ?? null,
    }))
  );
});

/**
 * Recalcula y persiste el plan. Es la acción que usa el operador cuando cambia
 * la programación y quiere que los huecos nuevos se cubran sin esperar al
 * siguiente ciclo automático.
 */
router.post("/plan/rebuild", async (_req: Request, res: Response) => {
  const count = await replanAnnouncements();
  const registered = await rescheduleAnnouncements();

  logger.info("AnnouncementAdmin", "Plan rebuilt manually", { persisted: count, registered });

  res.json({ persisted: count, registered });
});

/** Alterna el sistema de avisos sin perder el plan ya calculado. */
router.post("/toggle", async (req: Request, res: Response) => {
  const settings = await getSettings();
  const updated = await updateSettings({ enabled: !settings.enabled });

  if (!updated.enabled) {
    await prisma.announcementSlot.updateMany({
      where: { status: { in: ["pending", "deferred"] } },
      data: { status: "skipped", reason: "Deshabilitado desde el panel", settledAt: new Date() },
    });
  } else {
    await rescheduleAnnouncements();
  }

  res.json(toPublicSettings(updated));
});

export default router;
