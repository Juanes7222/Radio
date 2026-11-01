import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { AppError } from "../../shared/errors/app-error";
import {
  decryptSecret,
  encryptSecret,
  isSecretsKeyConfigured,
  type EncryptedSecret,
} from "../../shared/crypto/secrets";
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
 * panel, así que se guarda cifrada en su propia tabla y aquí solo se expone su
 * estado. El análisis del día usa constantes, porque sus dos márgenes dejaron de
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
  streamerPasswordStatus: StreamerPasswordStatus;
  bedsDir: string;
  bedVolume: number;
  trailingSilenceSeconds: number;
  updatedAt: Date;
}

/**
 * `stored` es una contraseña utilizable, `missing` es que no hay ninguna y
 * `unreadable` es que hay una guardada que no se descifra con la clave maestra
 * actual: el operador tiene que volver a escribirla.
 */
export type StreamerPasswordStatus = "stored" | "missing" | "unreadable";

const SINGLETON_ID = "singleton";

/** Margen generoso: una contraseña de AzuraCast ronda las 24 letras. */
const MAX_STREAMER_PASSWORD_LENGTH = 200;

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
 * synchronous path keeps working, and decrypts the password from its own table.
 */
export async function getSettings(): Promise<AnnouncementSettings> {
  const credential = await readStreamerPassword();

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
    streamerPassword: credential.password,
    streamerPasswordStatus: credential.status,
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
 * The password is prepared first for the same reason: a missing master key or an
 * oversized value must fail before the catalog is written, not after.
 */
export async function updateSettings(
  patch: AnnouncementSettingsPatch,
  changedBy = "panel"
): Promise<AnnouncementSettings> {
  const passwordWrite = prepareStreamerPassword(patch);
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

  await writeStreamerPassword(passwordWrite);

  logger.info("AnnouncementSettings", "Settings updated", {
    fields: Object.keys(patch),
    catalogKeys: Object.keys(catalogPatch),
    passwordChanged: passwordWrite.kind !== "keep",
  });

  return getSettings();
}

/**
 * The encrypted row is the only value outside the catalog. An empty string is
 * how the panel says "remove the stored password".
 */
type StreamerPasswordWrite =
  | { kind: "keep" }
  | { kind: "clear" }
  | { kind: "write"; secret: EncryptedSecret };

function prepareStreamerPassword(patch: AnnouncementSettingsPatch): StreamerPasswordWrite {
  if (!("streamerPassword" in patch)) return { kind: "keep" };

  const password = typeof patch.streamerPassword === "string" ? patch.streamerPassword.trim() : "";
  if (password === "") return { kind: "clear" };

  if (password.length > MAX_STREAMER_PASSWORD_LENGTH) {
    throw new AppError(
      400,
      `La contraseña del locutor no puede pasar de ${MAX_STREAMER_PASSWORD_LENGTH} caracteres.`
    );
  }

  if (!isSecretsKeyConfigured()) {
    throw new AppError(
      503,
      "El servidor no tiene SECRETS_ENCRYPTION_KEY, así que no puede cifrar la contraseña. Configúrala y vuelve a intentarlo."
    );
  }

  return { kind: "write", secret: encryptSecret(password) };
}

async function writeStreamerPassword(write: StreamerPasswordWrite): Promise<void> {
  if (write.kind === "keep") return;

  if (write.kind === "clear") {
    await prisma.announcementStreamerCredential.deleteMany({ where: { id: SINGLETON_ID } });
    return;
  }

  await prisma.announcementStreamerCredential.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...write.secret },
    update: { ...write.secret },
  });
}

/**
 * A stored password that cannot be decrypted is reported as `unreadable` and
 * logged: the master key changed or is missing, and guessing would only hide it.
 */
async function readStreamerPassword(): Promise<{
  password: string | null;
  status: StreamerPasswordStatus;
}> {
  const row = await prisma.announcementStreamerCredential.findUnique({
    where: { id: SINGLETON_ID },
  });

  if (!row) return { password: null, status: "missing" };

  try {
    return { password: decryptSecret(row), status: "stored" };
  } catch (error) {
    logger.warn("AnnouncementSettings", "The stored streamer password cannot be decrypted", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { password: null, status: "unreadable" };
  }
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
 * El panel solo necesita saber si hay una utilizable.
 */
export function toPublicSettings(settings: AnnouncementSettings) {
  return {
    ...settings,
    ...getAnnouncementPolicy(),
    streamerUser: settings.streamerUser,
    streamerPassword: null,
    streamerPasswordStatus: settings.streamerPasswordStatus,
  };
}
