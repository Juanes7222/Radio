import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";
import { analyzeDay, MINUTES_PER_DAY, type DayAnalysis } from "./freeWindows.service";
import { getSettings } from "./settings.service";

/**
 * Construcción del plan diario de avisos.
 *
 * El plan es una propuesta, no un compromiso. Coloca slots candidatos dentro de
 * las ventanas libres que la programación declara, y la decisión final se toma
 * en vivo al momento de cada slot (liveState.service.ts). Esa separación es lo
 * que permite que un programa que termina antes de lo previsto devuelva su
 * hora: el slot existe porque la ventana estaba libre al planear, y si el
 * programa se alarga el estado en vivo lo bloquea y lo difiere.
 */

export interface PlannedSlot {
  minuteOfDay: number;
  plannedFor: Date;
}

export interface PlanResult {
  dayKey: string;
  slots: PlannedSlot[];
  analysis: DayAnalysis;
  /** Cuántos slots se perdió por colisión de separación mínima. */
  droppedByGap: number;
}

/**
 * Construye el instante real de un minuto de estación a partir de la zona
 * horaria configurada, sin asumir que el host comparte zona con la estación.
 */
function stationInstantFor(timezone: string, dayKey: string, minuteOfDay: number): Date {
  const [year, month, day] = dayKey.split("-").map((part) => Number(part));
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  let result = new Date(utcGuess);
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = formatter.formatToParts(result);
    const asUtc = Date.UTC(
      Number(parts.find((p) => p.type === "year")?.value),
      Number(parts.find((p) => p.type === "month")?.value) - 1,
      Number(parts.find((p) => p.type === "day")?.value),
      Number(parts.find((p) => p.type === "hour")?.value) % 24,
      Number(parts.find((p) => p.type === "minute")?.value)
    );
    result = new Date(utcGuess - (asUtc - Math.floor(result.getTime() / 60_000) * 60_000));
  }

  return result;
}

/**
 * Candidatos aleatorios dentro de una ventana. Se muestrea en lugar de elegir
 * un extremo para que los avisos no se peguen al borde de un programa.
 */
function pickCandidateMinutes(
  window: { startMinute: number; endMinute: number },
  count: number,
  gapMinutes: number
): number[] {
  const span = window.endMinute - window.startMinute;
  if (span <= 0) return [];

  const chosen: number[] = [];
  const minimumSpacing = Math.min(gapMinutes, Math.floor(span / Math.max(1, count)));

  let attempts = 0;
  while (chosen.length < count && attempts < 200) {
    attempts++;
    const offset = Math.floor(Math.random() * (span + 1));
    const candidate = window.startMinute + offset;
    if (chosen.some((m) => Math.abs(m - candidate) < minimumSpacing)) continue;
    chosen.push(candidate);
  }

  return chosen.sort((a, b) => a - b);
}

/**
 * Reparte los slots entre las ventanas libres del día. Se empieza con uno por
 * ventana y se distribuyen los restantes de forma proporcional a su tamaño,
 * para que una ventana de cinco horas no reciba la misma cantidad que una de
 * veinte minutos.
 */
export async function buildPlan(date: Date = new Date()): Promise<PlanResult> {
  const settings = await getSettings();

  const analysis = await analyzeDay(date, {
    edgeMarginMinutes: settings.windowEdgeMarginMinutes,
    minWindowMinutes: settings.minWindowMinutes,
  });

  const nowMinute = getStationTime(date).hour * 60 + getStationTime(date).minute;

  // Trim each window to its future before sampling. Sampling the whole window and
  // dropping the past afterwards left the rest of the day unannounced whenever the
  // window had been open for hours: over 200 replans, 57% of plans were empty with
  // the window a quarter in the future, against 0% when it was entirely ahead.
  const usable = analysis.freeWindows
    .map((window) => ({
      startMinute: Math.max(window.startMinute, nowMinute + 2),
      endMinute: window.endMinute,
    }))
    .filter((window) => window.endMinute > window.startMinute);

  const totalFree = usable.reduce((sum, w) => sum + (w.endMinute - w.startMinute), 0);

  const candidates: number[] = [];
  let droppedByGap = 0;

  if (totalFree > 0) {
    for (const window of usable) {
      const share = Math.max(1, Math.round((settings.perHour * (window.endMinute - window.startMinute)) / totalFree));
      const wanted = Math.min(share, settings.perHour);
      candidates.push(...pickCandidateMinutes(window, wanted, settings.minGapMinutes));
    }
  }

  candidates.sort((a, b) => a - b);

  const slots: PlannedSlot[] = [];
  for (const minute of candidates) {
    if (slots.length > 0 && minute - slots[slots.length - 1].minuteOfDay < settings.minGapMinutes) {
      droppedByGap++;
      continue;
    }
    slots.push({
      minuteOfDay: minute,
      plannedFor: stationInstantFor(settings.timezone, analysis.dayKey, minute),
    });
  }

  return { dayKey: analysis.dayKey, slots, analysis, droppedByGap };
}

/**
 * Persiste el plan del día y limpia el anterior. Los slots quedan en
 * `pending`; los settled de un día anterior se conservan en la bitácora para
 * poder auditar por qué no sonó una hora concreta.
 */
export async function persistPlan(plan: PlanResult): Promise<number> {
  await prisma.announcementSlot.deleteMany({
    where: { planDate: plan.dayKey, status: "pending" },
  });

  if (plan.slots.length > 0) {
    await prisma.announcementSlot.createMany({
      data: plan.slots.map((slot) => ({
        minuteOfDay: slot.minuteOfDay,
        plannedFor: slot.plannedFor,
        planDate: plan.dayKey,
        status: "pending",
      })),
    });
  }

  logger.info("AnnouncementPlan", "Plan persisted", {
    dayKey: plan.dayKey,
    slotCount: plan.slots.length,
    droppedByGap: plan.droppedByGap,
    freeWindows: plan.analysis.freeWindows.length,
    freeMinutes: plan.analysis.freeMinutes,
    degraded: plan.analysis.degraded,
  });

  return plan.slots.length;
}

/**
 * Reconstruye y persiste el plan. Se llama al arranque, al cambiar la
 * programación y de forma periódica, porque un programa que termina antes de
 * lo previsto libera horas que el plan anterior descartó.
 */
export async function replanAnnouncements(date: Date = new Date()): Promise<number> {
  const settings = await getSettings();
  if (!settings.enabled) {
    await prisma.announcementSlot.updateMany({
      where: { status: "pending" },
      data: { status: "skipped", reason: "Deshabilitado desde el panel", settledAt: new Date() },
    });
    logger.info("AnnouncementPlan", "Announcements disabled, pending slots cancelled");
    return 0;
  }

  const plan = await buildPlan(date);
  return persistPlan(plan);
}

/**
 * Minutos libres del día ya calculados, reutilizados por el panel para no
 * repetir la consulta a AzuraCast en cada render.
 */
export async function getDayAnalysis(date: Date = new Date()): Promise<DayAnalysis> {
  const settings = await getSettings();
  return analyzeDay(date, {
    edgeMarginMinutes: settings.windowEdgeMarginMinutes,
    minWindowMinutes: settings.minWindowMinutes,
  });
}

/**
 * Horas con al menos una ventana libre utilizable en la fecha dada. Lo usa el
 * job nocturno para no pre-generar audio de horas que jamás podrán anunciar.
 */
export async function getHoursWithFreeWindow(date: Date): Promise<Set<number>> {
  const settings = await getSettings();
  const analysis = await analyzeDay(date, {
    edgeMarginMinutes: settings.windowEdgeMarginMinutes,
    minWindowMinutes: settings.minWindowMinutes,
  });

  const hours = new Set<number>();
  for (const window of analysis.freeWindows) {
    const firstHour = Math.floor(window.startMinute / 60);
    const lastHour = Math.floor((window.endMinute - 1) / 60);
    for (let hour = firstHour; hour <= lastHour; hour++) {
      if (hour >= 0 && hour <= 23) hours.add(hour);
    }
  }
  return hours;
}

export { MINUTES_PER_DAY };
