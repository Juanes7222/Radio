import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";
import { prisma } from "../../infrastructure/database/prisma";
import type { AnnouncementTemplate } from "@prisma/client";
import {
  buildTemplateVariables,
  minuteClause,
  periodWord,
  hourWord,
  to12Hour,
  timePhraseSentence,
} from "./timePhrase.service";

/**
 * Template rendering and template selection for announcements.
 *
 * The variables come from timePhrase.service, which owns the spoken Spanish.
 * This module decides which instant to describe, which template covers an
 * hour, and how a caller can override it, because the announcement must
 * describe the minute it is actually generated at rather than the top of the
 * hour.
 */

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Station day of year (1 = January 1st), used to rotate templates. */
function getDayIndex(): number {
  const { year, month, day } = getStationTime();
  const startOfYear = Date.UTC(year, 0, 0);
  return Math.round((Date.UTC(year, month - 1, day) - startOfYear) / DAY_IN_MS);
}

/**
 * Returns the active template for a given hour, rotating across
 * available templates based on the hour and day index.
 *
 * Lives here rather than in audioGeneration.service because both the generator
 * and the planner need it, and the planner also needs the template voice to
 * know which voice engine would answer for that hour.
 */
export async function getTemplateForHour(hour: number): Promise<AnnouncementTemplate> {
  const templates = await prisma.announcementTemplate.findMany({
    where: { type: "hourly", active: true },
    orderBy: { createdAt: "asc" },
  });

  if (templates.length === 0) {
    throw new Error("No active hourly templates found");
  }

  const index = (hour + getDayIndex()) % templates.length;
  return templates[index];
}

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
    if (
      key === "hour_text" ||
      key === "minutes_text" ||
      key === "time_text" ||
      key === "time_sentence" ||
      key === "time_bare"
    ) {
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
  timePhraseSentence,
  config as templateConfig,
};
