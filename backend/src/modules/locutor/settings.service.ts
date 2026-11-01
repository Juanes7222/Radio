import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import {
  currentRows,
  getBooleanSetting,
  getNumberSetting,
  getTextSetting,
} from "../settings/settings.cache";
import { applyPatch } from "../settings/settings.service";

/**
 * Configuración del planificador de avisos de hora.
 *
 * La fuente de verdad es el catálogo de ajustes (`station_settings`): trae
 * defaults, respaldo de entorno, validación y auditoría. La interfaz que
 * consume el panel no cambia, así que los jobs siguen leyendo este objeto.
 *
 * Lo único que no vive en el catálogo es la contraseña del streamer: no puede
 * estar en una tabla que entra completa en cada respaldo ni se devuelve al
 * panel. El análisis del día usa constantes, porque sus dos márgenes dejaron de
 * ser ajustes cuando el muestreo dejó de hacerse por franjas.
 */
export interface AnnouncementSettings {
  id: string;
  enabled: boolean;
  timezone: string;
  perHour: number;
  minGapMinutes: number;
  retryIntervalMinutes: number;
  maxRetries: number;
  respectLiveStreamer: boolean;
  respectScheduledPrograms: boolean;
  streamerUser: string | null;
  streamerPassword: string | null;
  bedsDir: string;
  bedVolume: number;
  trailingSilenceSeconds: number;
  updatedAt: Date;
}

const SINGLETON_ID = "singleton";

/**
 * Parámetros del plan nuevo que solo existen en el catálogo. Se exponen aparte
 * para que los jobs no tengan que conocer las claves.
 */
export interface AnnouncementPolicy {
  perDay: number;
  activeFromHour: number;
  activeToHour: number;
  programRetries: number;
  stuckLiveMinutes: number;
}

export function getAnnouncementPolicy(): AnnouncementPolicy {
  return {
    perDay: getNumberSetting("announcements.perDay"),
    activeFromHour: getNumberSetting("announcements.activeFromHour"),
    activeToHour: getNumberSetting("announcements.activeToHour"),
    programRetries: getNumberSetting("announcements.programRetries"),
    stuckLiveMinutes: getNumberSetting("announcements.stuckLiveMinutes"),
  };
}

/**
 * Reads every catalog value synchronously, so a job that already runs on a
 * synchronous path keeps working, and takes the password from its own table.
 */
export async function getSettings(): Promise<AnnouncementSettings> {
  const row = await prisma.announcementStreamerCredential.findUnique({
    where: { id: SINGLETON_ID },
  });

  return {
    id: SINGLETON_ID,
    enabled: getBooleanSetting("announcements.enabled"),
    timezone: getTextSetting("station.timezone"),
    perHour: getNumberSetting("announcements.maxPerHour"),
    minGapMinutes: getNumberSetting("announcements.minGapMinutes"),
    retryIntervalMinutes: getNumberSetting("announcements.retryIntervalMinutes"),
    // The old form and the new policy name the same retry budget differently.
    maxRetries: getNumberSetting("announcements.programRetries"),
    respectLiveStreamer: getBooleanSetting("announcements.respectLiveStreamer"),
    respectScheduledPrograms: getBooleanSetting("announcements.respectScheduledPrograms"),
    streamerUser: getTextSetting("announcements.streamerUser") || null,
    streamerPassword: row?.streamerPassword ?? null,
    bedsDir: getTextSetting("announcements.bedsDir"),
    bedVolume: getNumberSetting("announcements.bedVolume"),
    trailingSilenceSeconds: getNumberSetting("announcements.trailingSilenceSeconds"),
    updatedAt: latestUpdatedAt(),
  };
}

export interface AnnouncementSettingsPatch {
  enabled?: boolean;
  timezone?: string;
  perHour?: number;
  minGapMinutes?: number;
  retryIntervalMinutes?: number;
  maxRetries?: number;
  respectLiveStreamer?: boolean;
  respectScheduledPrograms?: boolean;
  streamerUser?: string | null;
  streamerPassword?: string | null;
  bedsDir?: string;
  bedVolume?: number;
  trailingSilenceSeconds?: number;
  perDay?: number;
  activeFromHour?: number;
  activeToHour?: number;
  programRetries?: number;
  stuckLiveMinutes?: number;
}

/** Panel field -> catalog key. The panel keeps its names; storage uses the catalog's. */
const PATCH_KEYS: Record<keyof AnnouncementSettingsPatch, string | null> = {
  enabled: "announcements.enabled",
  timezone: "station.timezone",
  perHour: "announcements.maxPerHour",
  minGapMinutes: "announcements.minGapMinutes",
  retryIntervalMinutes: "announcements.retryIntervalMinutes",
  maxRetries: "announcements.programRetries",
  respectLiveStreamer: "announcements.respectLiveStreamer",
  respectScheduledPrograms: "announcements.respectScheduledPrograms",
  streamerUser: "announcements.streamerUser",
  streamerPassword: null,
  bedsDir: "announcements.bedsDir",
  bedVolume: "announcements.bedVolume",
  trailingSilenceSeconds: "announcements.trailingSilenceSeconds",
  perDay: "announcements.perDay",
  activeFromHour: "announcements.activeFromHour",
  activeToHour: "announcements.activeToHour",
  programRetries: "announcements.programRetries",
  stuckLiveMinutes: "announcements.stuckLiveMinutes",
};

/**
 * Applies a partial save. Every catalog value goes through `applyPatch`, which
 * validates the whole patch before writing, so a rejected number leaves the
 * rest untouched and no half-applied configuration reaches the jobs.
 *
 * A nullable text field (`streamerUser`) becomes the empty string, which is how
 * "use the automatic account" is stored.
 */
export async function updateSettings(
  patch: AnnouncementSettingsPatch,
  changedBy = "panel"
): Promise<AnnouncementSettings> {
  const catalogPatch: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(patch)) {
    const key = PATCH_KEYS[field as keyof AnnouncementSettingsPatch];
    if (!key) continue;
    catalogPatch[key] = typeof value === "string" && value.trim() === "" ? "" : value;
    if (value === null && key === "announcements.streamerUser") catalogPatch[key] = "";
  }

  if (Object.keys(catalogPatch).length > 0) {
    await applyPatch(catalogPatch, changedBy);
  }

  await updateRowSettings(patch);

  logger.info("AnnouncementSettings", "Settings updated", {
    fields: Object.keys(patch),
    catalogKeys: Object.keys(catalogPatch),
  });

  return getSettings();
}

/**
 * The only value outside the catalog. The row is created on demand so a station
 * that never saved a password still has somewhere to store it.
 */
async function updateRowSettings(patch: AnnouncementSettingsPatch): Promise<void> {
  if (!("streamerPassword" in patch)) return;

  const streamerPassword =
    typeof patch.streamerPassword === "string" && patch.streamerPassword.trim() !== ""
      ? patch.streamerPassword.trim()
      : null;

  await prisma.announcementStreamerCredential.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, streamerPassword },
    update: { streamerPassword },
  });
}

/** Newest write among the keys this object reads, for the panel's timestamp. */
function latestUpdatedAt(): Date {
  let latest: Date | null = null;

  for (const [key, row] of currentRows()) {
    if (key !== "station.timezone" && !key.startsWith("announcements.")) continue;
    if (!latest || row.updatedAt > latest) latest = row.updatedAt;
  }

  return latest ?? new Date();
}

/**
 * Vista sin secretos: la contraseña del streamer nunca sale del backend.
 * El panel solo necesita saber si hay una configurada.
 */
export function toPublicSettings(settings: AnnouncementSettings) {
  return {
    ...settings,
    ...getAnnouncementPolicy(),
    streamerUser: settings.streamerUser,
    streamerPassword: null,
    hasStreamerPassword: Boolean(settings.streamerPassword),
  };
}
