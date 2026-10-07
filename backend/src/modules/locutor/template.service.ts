import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";
import {
  buildTemplateVariables,
  minuteClause,
  periodWord,
  hourWord,
  to12Hour,
} from "./timePhrase.service";

/**
 * Template rendering for announcements.
 *
 * The variables come from timePhrase.service, which owns the spoken Spanish.
 * This module only decides which instant to describe and how a caller can
 * override it, because the announcement must describe the minute it is
 * actually generated at rather than the top of the hour.
 */

export interface RenderVariables {
  hour24?: string | number;
  minutes?: string | number;
  [key: string]: string | number | undefined;
}

/**
 * Renders a template. Callers may pass `hour24` and `minutes` to describe a
 * specific instant; when they do not, the current station time is used.
 *
 * `hour_text`, `minutes_text`, `time_text` and `period` are always recomputed
 * from the resolved instant, so a template that uses them describes a real
 * clock reading instead of an hour with the minutes missing.
 */
export function renderTemplate(template: string, variables: RenderVariables = {}): string {
  const stationTime = getStationTime();

  const hour24 = resolveHour24(variables.hour24, stationTime.hour);
  const minutes = resolveMinutes(variables.minutes, stationTime.minute);

  const computed = buildTemplateVariables(
    hour24,
    minutes,
    stationTime.dayIndex,
    stationTime.day,
    stationTime.month
  );

  const merged: Record<string, string> = { ...computed };

  // Explicit variables win, except for the time fields: those must describe
  // the resolved instant, otherwise a template combining an overridden hour
  // with a stale minutes clause produces a sentence that is simply wrong.
  for (const [key, value] of Object.entries(variables)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "hour24" || key === "minutes") continue;
    if (key === "hour_text" || key === "minutes_text" || key === "time_text" || key === "time_bare") {
      continue;
    }
    merged[key] = String(value);
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = merged[key];
    if (value === undefined || value === null) {
      logger.warn("TemplateService", "Unknown template variable", { key, template });
      return "";
    }
    return value;
  });
}

function resolveHour24(value: string | number | undefined, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return ((Math.trunc(parsed) % 24) + 24) % 24;
}

function resolveMinutes(value: string | number | undefined, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return ((Math.trunc(parsed) % 60) + 60) % 60;
}

export {
  buildTemplateVariables,
  minuteClause,
  periodWord,
  hourWord,
  to12Hour,
  config as templateConfig,
};
