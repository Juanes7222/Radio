import { logger } from "../../shared/logger/logger";
import { getStationDayStart, getStationTime } from "../../shared/utils/date";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";

/**
 * Cálculo de las ventanas libres del día a partir de la programación de
 * AzuraCast.
 *
 * Decisión de diseño: todo ítem programado es un programa. No hay lista de
 * palabras clave. Un sistema que adivina por nombre no puede cumplir la regla
 * de "nunca interrumpir un programa": con tu malla, "LECTURA BIBLICA" y "TU
 * HISTORIA PREFERIDA" no contienen ninguna palabra clave típica y quedaban
 * libres, mientras que "REV JOSÉ SOTO" se bloqueaba solo porque la abreviatura
 * REV containía la subcadena "rev".
 *
 * La granularidad es de minutos y no de horas porque conviven bloques de dos
 * horas con otros de seis minutos. Bloquear la hora entera por un bloque de
 * seis minutos era buena parte de las horas perdidas.
 */

export const MINUTES_PER_DAY = 1440;

interface AzuraScheduleItem {
  id?: number;
  start_timestamp: number;
  end_timestamp: number;
  title?: string;
  name?: string;
  playlist_id?: number;
}

/** Free interval in station minutes, with an exclusive end. */
export interface FreeWindow {
  startMinute: number;
  endMinute: number;
}

export interface DayAnalysis {
  /** Instante de medianoche en hora de estación del día analizado. */
  dayKey: string;
  /** Programa en curso según la programación, si lo hay. */
  currentProgram: { title: string; endsAtMinute: number } | null;
  /** Intervalos ocupados por la programación. */
  busyIntervals: Array<{ startMinute: number; endMinute: number; title: string }>;
  /** Huecos utilizables tras aplicar tamaño mínimo y margen de bordes. */
  freeWindows: FreeWindow[];
  /** Minutos libres totales antes de aplicar restricciones de tamaño. */
  freeMinutes: number;
  /** true si AzuraCast no respondió y el resultado no es confiable. */
  degraded: boolean;
}

/**
 * `dayEnd` needs its own case: the next day's midnight formats as 00:00, so a
 * program ending at midnight reported endMinute 0, the hour-boundary trim made
 * it -1, and subtractBusy drops intervals ending at or before 0. A 22:00 to
 * 24:00 block then vanished and its whole span read as free time.
 */
function toStationMinute(instant: Date, timezone?: string, dayEnd?: Date): number {
  if (dayEnd && instant.getTime() >= dayEnd.getTime()) return MINUTES_PER_DAY;
  const { hour, minute } = getStationTime(instant, timezone);
  return hour * 60 + minute;
}

async function fetchDaySchedule(start: Date, end: Date): Promise<AzuraScheduleItem[] | null> {
  try {
    const { data } = await azuracastApi.get<AzuraScheduleItem[]>(`/station/${STATION_ID}/schedule`, {
      params: { start: start.toISOString(), end: end.toISOString() },
      timeout: 8_000,
    });

    if (!Array.isArray(data)) throw new Error("Unexpected station schedule response");
    return data;
  } catch (err) {
    logger.warn("ScheduleAnalyzer", "Failed to fetch station schedule", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Normaliza los minutos de una ocurrencia al día analizado. Un programa que
 * cruza medianoche ocupa el final del día actual y el comienzo del siguiente;
 * para el día actual solo nos interesa su parte final.
 */
function toDayInterval(
  start: Date,
  end: Date,
  dayStart: Date,
  dayEnd: Date,
  timezone?: string
): { startMinute: number; endMinute: number } | null {
  const overlapStart = Math.max(start.getTime(), dayStart.getTime());
  const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());
  if (overlapEnd <= overlapStart) return null;

  return {
    startMinute: toStationMinute(new Date(overlapStart), timezone),
    endMinute: Math.min(MINUTES_PER_DAY, toStationMinute(new Date(overlapEnd), timezone, dayEnd)
      + (overlapEnd % 60_000 === 0 ? 0 : 1)),
  };
}

function subtractBusy(
  busy: Array<{ startMinute: number; endMinute: number }>
): FreeWindow[] {
  const sorted = [...busy].sort((a, b) => a.startMinute - b.startMinute);
  const windows: FreeWindow[] = [];
  let cursor = 0;

  for (const interval of sorted) {
    const start = Math.max(0, Math.min(MINUTES_PER_DAY, interval.startMinute));
    const end = Math.max(0, Math.min(MINUTES_PER_DAY, interval.endMinute));
    if (end <= 0 || start >= MINUTES_PER_DAY) continue;

    if (start > cursor) {
      windows.push({ startMinute: cursor, endMinute: start });
    }
    cursor = Math.max(cursor, end);
  }

  if (cursor < MINUTES_PER_DAY) {
    windows.push({ startMinute: cursor, endMinute: MINUTES_PER_DAY });
  }

  return windows;
}

/**
 * Aplica el margen de bordes y el tamaño mínimo. Un aviso pegado al inicio de
 * un programa puede pisar la entrada de este; uno pegado al final puede pisar
 * la salida. Los huecos más chicos que el mínimo no admiten un aviso
 * aleatorio con confianza.
 */
function applyWindowRules(
  windows: FreeWindow[],
  edgeMarginMinutes: number,
  minWindowMinutes: number
): FreeWindow[] {
  const usable: FreeWindow[] = [];

  for (const window of windows) {
    const start = window.startMinute + edgeMarginMinutes;
    const end = window.endMinute - edgeMarginMinutes;
    if (end - start >= minWindowMinutes) {
      usable.push({ startMinute: start, endMinute: end });
    }
  }

  return usable;
}

export interface AnalyzeOptions {
  edgeMarginMinutes: number;
  minWindowMinutes: number;
  timezone?: string;
}

/**
 * Analiza el día de estación que contiene `date` y devuelve los huecos
 * utilizables. Con `degraded` en true el resultado es incompleto porque
 * AzuraCast no respondió: el llamador debe tratar eso como "no se sabe" y no
 * como "todo libre".
 */
export async function analyzeDay(
  date: Date = new Date(),
  options: AnalyzeOptions
): Promise<DayAnalysis> {
  const stationNow = getStationTime(date, options.timezone);
  const dayKey = stationNow.dayKey;
  const dayStart = getStationDayStart(date, options.timezone);
  const dayEnd = getStationDayStart(new Date(dayStart.getTime() + 30 * 60 * 60_000), options.timezone);
  const schedule = await fetchDaySchedule(dayStart, dayEnd);

  const busyIntervals: Array<{ startMinute: number; endMinute: number; title: string }> = [];
  let currentProgram: DayAnalysis["currentProgram"] = null;

  if (schedule) {
    const nowMinute = stationNow.hour * 60 + stationNow.minute;

    for (const item of schedule) {
      if (!Number.isFinite(item.start_timestamp) || !Number.isFinite(item.end_timestamp)) continue;

      const start = new Date(item.start_timestamp * 1000);
      const end = new Date(item.end_timestamp * 1000);
      const interval = toDayInterval(start, end, dayStart, dayEnd, options.timezone);
      if (!interval) continue;

      const title = (item.title ?? item.name ?? "Programa").trim();

      const { startMinute, endMinute } = interval;
      busyIntervals.push({ ...interval, title });

      if (nowMinute >= startMinute && nowMinute < endMinute) {
        if (!currentProgram || endMinute > currentProgram.endsAtMinute) {
          currentProgram = { title, endsAtMinute: endMinute };
        }
      }
    }
  }

  const rawWindows = schedule === null ? [] : subtractBusy(busyIntervals);
  const freeMinutes = rawWindows.reduce(
    (total, window) => total + (window.endMinute - window.startMinute),
    0
  );
  const freeWindows = applyWindowRules(
    rawWindows,
    options.edgeMarginMinutes,
    options.minWindowMinutes
  );

  return {
    dayKey,
    currentProgram,
    busyIntervals: busyIntervals.sort((a, b) => a.startMinute - b.startMinute),
    freeWindows,
    freeMinutes,
    degraded: schedule === null,
  };
}

/**
 * Minutos libres ahora mismo según la programación, sin restricciones de
 * tamaño. Es la señal que usa el panel para mostrar "estamos en un programa" o
 * "estamos en un hueco".
 */
export function isFreeMinuteAt(analysis: DayAnalysis, minuteOfDay: number): boolean {
  return analysis.freeWindows.some(
    (window) => minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute
  );
}
