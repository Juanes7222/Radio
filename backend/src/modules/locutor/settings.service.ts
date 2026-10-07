import { prisma } from "../../infrastructure/database/prisma";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

/**
 * Configuración del planificador de avisos de hora, persistida para que el
 * panel sea la única fuente de verdad. Los valores por defecto del schema
 * coinciden con los del `.env`, de modo que una instalación nueva arranca
 * funcionando sin tocar la base.
 */
export interface AnnouncementSettings {
  id: string;
  enabled: boolean;
  timezone: string;
  perHour: number;
  minGapMinutes: number;
  windowEdgeMarginMinutes: number;
  minWindowMinutes: number;
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

function fromEnv(): Omit<AnnouncementSettings, "id" | "updatedAt"> {
  return {
    enabled: true,
    timezone: config.locutor.timezone,
    perHour: config.locutor.announcementsPerHour,
    minGapMinutes: config.locutor.minAnnouncementGapMinutes,
    windowEdgeMarginMinutes: 3,
    minWindowMinutes: 10,
    retryIntervalMinutes: 5,
    maxRetries: 4,
    respectLiveStreamer: true,
    respectScheduledPrograms: true,
    streamerUser: config.locutor.streamerUser || null,
    streamerPassword: config.locutor.streamerPassword || null,
    bedsDir: config.locutor.bedsDir,
    bedVolume: config.locutor.bedVolume,
    trailingSilenceSeconds: 3,
  };
}

/**
 * Lectura de la configuración. Crea la fila la primera vez usando el `.env`
 * como origen, para que un despliegue que ya define variables no requiera
 * una migración manual.
 */
export async function getSettings(): Promise<AnnouncementSettings> {
  const existing = await prisma.announcementSettings.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (existing) return existing;

  return prisma.announcementSettings.create({
    data: { id: SINGLETON_ID, ...fromEnv() },
  });
}

/** Límites de lo que el panel puede enviar. El backend no confía en la UI. */
const LIMITS = {
  perHour: { min: 1, max: 12 },
  minGapMinutes: { min: 0, max: 180 },
  windowEdgeMarginMinutes: { min: 0, max: 30 },
  minWindowMinutes: { min: 1, max: 120 },
  retryIntervalMinutes: { min: 1, max: 60 },
  maxRetries: { min: 0, max: 20 },
  trailingSilenceSeconds: { min: 0, max: 30 },
  bedVolume: { min: 0, max: 1 },
} as const;

function clampInt(value: unknown, fallback: number, range: { min: number; max: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

function clampFloat(value: unknown, fallback: number, range: { min: number; max: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function textOrNull(value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface AnnouncementSettingsPatch {
  enabled?: boolean;
  timezone?: string;
  perHour?: number;
  minGapMinutes?: number;
  windowEdgeMarginMinutes?: number;
  minWindowMinutes?: number;
  retryIntervalMinutes?: number;
  maxRetries?: number;
  respectLiveStreamer?: boolean;
  respectScheduledPrograms?: boolean;
  streamerUser?: string | null;
  streamerPassword?: string | null;
  bedsDir?: string;
  bedVolume?: number;
  trailingSilenceSeconds?: number;
}

/**
 * Aplica un parche parcial. Solo toca los campos presentes, para que el panel
 * pueda enviar un formulario parcial sin borrar lo que no envió.
 */
export async function updateSettings(patch: AnnouncementSettingsPatch): Promise<AnnouncementSettings> {
  const current = await getSettings();

  const data: Record<string, unknown> = {};

  if ("enabled" in patch) data.enabled = boolOr(patch.enabled, current.enabled);
  if ("timezone" in patch) data.timezone = textOrNull(patch.timezone, current.timezone) ?? current.timezone;
  if ("perHour" in patch) data.perHour = clampInt(patch.perHour, current.perHour, LIMITS.perHour);
  if ("minGapMinutes" in patch) {
    data.minGapMinutes = clampInt(patch.minGapMinutes, current.minGapMinutes, LIMITS.minGapMinutes);
  }
  if ("windowEdgeMarginMinutes" in patch) {
    data.windowEdgeMarginMinutes = clampInt(
      patch.windowEdgeMarginMinutes,
      current.windowEdgeMarginMinutes,
      LIMITS.windowEdgeMarginMinutes
    );
  }
  if ("minWindowMinutes" in patch) {
    data.minWindowMinutes = clampInt(
      patch.minWindowMinutes,
      current.minWindowMinutes,
      LIMITS.minWindowMinutes
    );
  }
  if ("retryIntervalMinutes" in patch) {
    data.retryIntervalMinutes = clampInt(
      patch.retryIntervalMinutes,
      current.retryIntervalMinutes,
      LIMITS.retryIntervalMinutes
    );
  }
  if ("maxRetries" in patch) data.maxRetries = clampInt(patch.maxRetries, current.maxRetries, LIMITS.maxRetries);
  if ("respectLiveStreamer" in patch) {
    data.respectLiveStreamer = boolOr(patch.respectLiveStreamer, current.respectLiveStreamer);
  }
  if ("respectScheduledPrograms" in patch) {
    data.respectScheduledPrograms = boolOr(
      patch.respectScheduledPrograms,
      current.respectScheduledPrograms
    );
  }
  if ("streamerUser" in patch) data.streamerUser = textOrNull(patch.streamerUser, current.streamerUser);
  if ("streamerPassword" in patch) {
    data.streamerPassword = textOrNull(patch.streamerPassword, current.streamerPassword);
  }
  if ("bedsDir" in patch) data.bedsDir = textOrNull(patch.bedsDir, current.bedsDir) ?? current.bedsDir;
  if ("bedVolume" in patch) data.bedVolume = clampFloat(patch.bedVolume, current.bedVolume, LIMITS.bedVolume);
  if ("trailingSilenceSeconds" in patch) {
    data.trailingSilenceSeconds = clampInt(
      patch.trailingSilenceSeconds,
      current.trailingSilenceSeconds,
      LIMITS.trailingSilenceSeconds
    );
  }

  const updated = await prisma.announcementSettings.update({
    where: { id: SINGLETON_ID },
    data,
  });

  logger.info("AnnouncementSettings", "Settings updated", {
    fields: Object.keys(data),
    enabled: updated.enabled,
    perHour: updated.perHour,
  });

  return updated;
}

/**
 * Vista sin secretos: la contraseña del streamer nunca sale del backend.
 * El panel solo necesita saber si hay una configurada.
 */
export function toPublicSettings(settings: AnnouncementSettings) {
  return {
    ...settings,
    streamerUser: settings.streamerUser,
    streamerPassword: null,
    hasStreamerPassword: Boolean(settings.streamerPassword),
  };
}
