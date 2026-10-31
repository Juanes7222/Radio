import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";
import { analyzeDay, MINUTES_PER_DAY, type DayAnalysis } from "./freeWindows.service";
import { getAnnouncementPolicy, getSettings } from "./settings.service";

/**
 * Construcción del plan diario de avisos.
 *
 * El plan es una propuesta, no un compromiso: la decisión final se toma en vivo
 * al momento de cada slot (liveState.service.ts). Lo que el plan sí garantiza es
 * el presupuesto: se sortean `perDay` avisos repartidos por el día completo y el
 * contador cuenta solo los emitidos, no los intentos.
 *
 * El muestreo es sobre el día entero y no sobre las ventanas libres de la
 * programación. Un programa que termina antes de lo previsto libera su hora en
 * vivo, así que sembrar ahí no cuesta nada: un slot bloqueado gasta una consulta
 * y cero caracteres. Sembrar solo en huecos era lo que perdía la hora de una
 * predica que acabó temprano.
 */

export interface PlannedSlot {
  minuteOfDay: number;
  plannedFor: Date;
}

export interface PlanResult {
  dayKey: string;
  /** Plan completo del día: los slots conservados más los nuevos. */
  slots: PlannedSlot[];
  /** Solo los slots que hay que insertar. */
  newSlots: PlannedSlot[];
  /** Pendientes que sobran del presupuesto y hay que descartar. */
  cancelledIds: string[];
  analysis: DayAnalysis;
  /** Candidatos que se perdieron por la separación mínima. */
  droppedByGap: number;
  budget: number;
  played: number;
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

interface SampleParams {
  from: number;
  to: number;
  count: number;
  minGapMinutes: number;
  maxPerHour: number;
  taken: number[];
}

/**
 * Sortea minutos uniformes en la franja activa respetando las dos restricciones
 * que el operador configura: separación mínima entre avisos y techo por hora de
 * reloj. Si la franja no admite tantos avisos, se siembran los que caben:
 * perder uno tarde en el día es correcto, amontonarlos no.
 */
function sampleMinutes(params: SampleParams): { minutes: number[]; dropped: number } {
  const { from, to, count, minGapMinutes, maxPerHour, taken } = params;

  if (count <= 0 || to <= from) return { minutes: [], dropped: 0 };

  const chosen: number[] = [];
  const perHour = new Map<number, number>();
  for (const minute of taken) {
    const hour = Math.floor(minute / 60);
    perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
  }

  let attempts = 0;
  const maxAttempts = Math.max(500, count * 400);

  while (chosen.length < count && attempts < maxAttempts) {
    attempts++;
    const candidate = from + Math.floor(Math.random() * (to - from));
    const hour = Math.floor(candidate / 60);

    if ((perHour.get(hour) ?? 0) >= maxPerHour) continue;
    if (taken.some((minute) => Math.abs(minute - candidate) < minGapMinutes)) continue;
    if (chosen.some((minute) => Math.abs(minute - candidate) < minGapMinutes)) continue;

    chosen.push(candidate);
    perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
  }

  chosen.sort((a, b) => a - b);
  return { minutes: chosen, dropped: count - chosen.length };
}

/**
 * Arma el plan del día: conserva los slots pendientes que todavía están por
 * delante, descarta los que sobran del presupuesto y sortea solo los que faltan.
 *
 * El día no se reconstruye desde cero porque el replan corre cada quince
 * minutos: borrar y volver a sortear regalaba cupo y movía avisos ya elegidos.
 */
export async function buildPlan(date: Date = new Date()): Promise<PlanResult> {
  const settings = await getSettings();
  const policy = getAnnouncementPolicy();
  const station = getStationTime(date);
  const nowMinute = station.hour * 60 + station.minute;

  const analysis = await analyzeDay(date, {
    edgeMarginMinutes: settings.windowEdgeMarginMinutes,
    minWindowMinutes: settings.minWindowMinutes,
  });

  const [playedRows, openRows] = await Promise.all([
    prisma.announcementSlot.findMany({
      where: { planDate: analysis.dayKey, status: "played" },
      select: { minuteOfDay: true },
    }),
    prisma.announcementSlot.findMany({
      where: { planDate: analysis.dayKey, status: { in: ["pending", "deferred"] } },
      orderBy: { minuteOfDay: "asc" },
      select: { id: true, minuteOfDay: true, plannedFor: true },
    }),
  ]);

  const budget = Math.max(0, policy.perDay - playedRows.length);

  const upcoming = openRows.filter((row) => row.minuteOfDay > nowMinute + 1);
  const kept = upcoming.slice(0, budget);
  const cancelledIds = upcoming.slice(budget).map((row) => row.id);

  const needed = Math.max(0, budget - kept.length);
  const from = Math.max(policy.activeFromHour * 60, nowMinute + 2);
  const to = Math.min(MINUTES_PER_DAY, policy.activeToHour * 60);

  const { minutes, dropped } = sampleMinutes({
    from,
    to,
    count: needed,
    minGapMinutes: settings.minGapMinutes,
    maxPerHour: settings.perHour,
    taken: [...playedRows, ...kept].map((row) => row.minuteOfDay),
  });

  const newSlots: PlannedSlot[] = minutes.map((minute) => ({
    minuteOfDay: minute,
    plannedFor: stationInstantFor(settings.timezone, analysis.dayKey, minute),
  }));

  const slots: PlannedSlot[] = [
    ...kept.map((row) => ({ minuteOfDay: row.minuteOfDay, plannedFor: row.plannedFor })),
    ...newSlots,
  ].sort((a, b) => a.minuteOfDay - b.minuteOfDay);

  return {
    dayKey: analysis.dayKey,
    slots,
    newSlots,
    cancelledIds,
    analysis,
    droppedByGap: dropped,
    budget,
    played: playedRows.length,
  };
}

/**
 * Persiste el plan: inserta solo los slots nuevos y descarta los pendientes que
 * quedaron fuera del presupuesto. Los settled se conservan en la bitácora para
 * poder auditar por qué no sonó una hora concreta.
 */
export async function persistPlan(plan: PlanResult): Promise<number> {
  if (plan.cancelledIds.length > 0) {
    await prisma.announcementSlot.updateMany({
      where: { id: { in: plan.cancelledIds } },
      data: {
        status: "skipped",
        reason: "Fuera del presupuesto diario",
        settledAt: new Date(),
      },
    });
  }

  if (plan.newSlots.length > 0) {
    await prisma.announcementSlot.createMany({
      data: plan.newSlots.map((slot) => ({
        minuteOfDay: slot.minuteOfDay,
        plannedFor: slot.plannedFor,
        planDate: plan.dayKey,
        status: "pending",
      })),
    });
  }

  logger.info("AnnouncementPlan", "Plan persisted", {
    dayKey: plan.dayKey,
    slots: plan.slots.length,
    added: plan.newSlots.length,
    cancelled: plan.cancelledIds.length,
    budget: plan.budget,
    played: plan.played,
    droppedByGap: plan.droppedByGap,
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
 * repetir la consulta a AzuraCast en cada render. El análisis ya no decide
 * dónde se siembran los avisos: solo explica el día en el panel.
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
 * job nocturno heredado; el camino de emisión ya no depende de él.
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
