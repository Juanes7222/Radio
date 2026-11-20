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
function getDayIndex({ year, month, day }: ReturnType<typeof getStationTime>): number {
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
export async function getTemplateForHour(
  hour: number,
  minute = 0,
  stationTime = getStationTime()
): Promise<AnnouncementTemplate> {
  const templates = await prisma.announcementTemplate.findMany({
    where: { type: "hourly", active: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (templates.length === 0) {
    throw new Error("No active hourly templates found");
  }

  const index = (hour + minute + getDayIndex(stationTime)) % templates.length;
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
export function renderTemplate(
  template: string,
  variables: RenderVariables = {},
  stationTime = getStationTime()
): string {

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
    const value = Object.prototype.hasOwnProperty.call(merged, key) ? merged[key] : undefined;
    if (value === undefined || value === null) {
      logger.warn("TemplateService", "Unknown template variable", { key, template });
      return "";
    }
    return value;
  });
}

export function renderAnnouncementTemplate(
  template: Pick<AnnouncementTemplate, "type" | "textTemplate">,
  variables: RenderVariables = {},
  stationTime = getStationTime()
): string {
  let text = template.textTemplate;
  const hasFullTime = /\{\{(?:time_text|time_sentence|time_bare)\}\}/.test(text);
  const hasMinute = /\{\{(?:minutes|minutes_text)\}\}/.test(text);
  const hasHour = /\{\{(?:hour|hour24|hour_text)\}\}/.test(text);

  if (template.type === "hourly" && !hasFullTime) {
    if (hasHour && !hasMinute) {
      text = text
        .replace(/\b(son las|es la)\s+\{\{hour_text\}\}(?:\s+en punto)?/gi,
          (phrase) => phrase[0] === phrase[0].toUpperCase() ? "{{time_sentence}}" : "{{time_text}}")
        .replace(/\{\{(?:hour|hour24|hour_text)\}\}(?:\s+en punto)?(\s+\{\{period\}\})?/g,
          "{{time_bare}}");
    } else if (!hasHour) {
      text = `${text.trim()} {{time_sentence}}.`;
    }
  }

  return renderTemplate(text, variables, stationTime);
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
