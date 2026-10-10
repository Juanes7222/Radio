import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationDayStart, getStationTime } from "../../shared/utils/date";
import { STATION_ID } from "../azuracast/azuracast.client";

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

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
  timeout: 10_000,
});

export const MINUTES_PER_DAY = 1440;

interface AzuraScheduleItem {
  id?: number;
  start_timestamp: number;
  end_timestamp: number;
  title?: string;
  name?: string;
  playlist_id?: number;
}

/** Intervalo libre en minutos desde medianoche, ambos extremos abiertos. */
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
function toStationMinute(instant: Date, dayEnd?: Date): number {
  if (dayEnd && instant.getTime() >= dayEnd.getTime()) return MINUTES_PER_DAY;
  const { hour, minute } = getStationTime(instant);
  return hour * 60 + minute;
}

async function fetchDaySchedule(date: Date): Promise<AzuraScheduleItem[] | null> {
  try {
    const start = getStationDayStart(date);
    const end = new Date(start.getTime() + MINUTES_PER_DAY * 60_000 - 1);

    const { data } = await azApi.get(`/station/${STATION_ID}/schedule`, {
      params: { start: start.toISOString(), end: end.toISOString() },
    });

    return Array.isArray(data) ? (data as AzuraScheduleItem[]) : [];
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
  dayStart: Date
): { startMinute: number; endMinute: number } | null {
  const dayEnd = new Date(dayStart.getTime() + MINUTES_PER_DAY * 60_000);
  const overlapStart = Math.max(start.getTime(), dayStart.getTime());
  const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());
  if (overlapEnd <= overlapStart) return null;

  return {
    startMinute: toStationMinute(new Date(overlapStart)),
    endMinute: toStationMinute(new Date(overlapEnd), dayEnd),
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
  const stationNow = getStationTime(date);
  const dayKey = stationNow.dayKey;
  const dayStart = getStationDayStart(date);
  const schedule = await fetchDaySchedule(date);

  const busyIntervals: Array<{ startMinute: number; endMinute: number; title: string }> = [];
  let currentProgram: DayAnalysis["currentProgram"] = null;

  if (schedule) {
    const nowMinute = stationNow.hour * 60 + stationNow.minute;

    for (const item of schedule) {
      if (!Number.isFinite(item.start_timestamp) || !Number.isFinite(item.end_timestamp)) continue;

      const start = new Date(item.start_timestamp * 1000);
      const end = new Date(item.end_timestamp * 1000);
      const interval = toDayInterval(start, end, dayStart);
      if (!interval) continue;

      const title = (item.title ?? item.name ?? "Programa").trim();

      // Un bloque que termina exactamente en punto no ocupa el minuto inicial
      // de la hora siguiente: 14:00-15:00 deja libre desde las 15:00.
      const endsOnHourBoundary = interval.endMinute % 60 === 0;
      const endMinute =
        endsOnHourBoundary && interval.endMinute > interval.startMinute
          ? interval.endMinute - 1
          : interval.endMinute;

      busyIntervals.push({ ...interval, endMinute, title });

      if (nowMinute >= interval.startMinute && nowMinute <= interval.endMinute) {
        if (!currentProgram || endMinute > currentProgram.endsAtMinute) {
          currentProgram = { title, endsAtMinute: endMinute };
        }
      }
    }
  }

  const rawWindows = subtractBusy(busyIntervals);
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
    (window) => minuteOfDay >= window.startMinute && minuteOfDay <= window.endMinute
  );
}
