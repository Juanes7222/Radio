import { boolEnvOr, intEnvOr } from "../../config/env";
import type { SettingDefinition, SettingSectionId } from "./settings.types";

/**
 * The catalog is the only place a setting is declared: its key, type, range,
 * operator copy and defaults live here and `station_settings` stays a plain
 * key/value table. Adding a setting is therefore a code change in this file,
 * not a Prisma migration.
 *
 * `parse` is deliberately permissive and `format` is the inverse of `parse`.
 * Range rejection belongs to `settings.validation.ts`, which owns the operator
 * message; a tolerant reader and a strict writer are two different jobs.
 */
export const SETTINGS_CATALOG = {
  "health.emailEnabled": {
    key: "health.emailEnabled",
    section: "health",
    label: "Enviar alertas de salud por correo",
    description: "Cuando está activo, el vigilante notifica a los destinatarios configurados.",
    type: "boolean",
    defaultValue: true,
    envFallback: () => boolEnvOr("HEALTH_EMAIL_ENABLED", true),
    parse: parseBoolean,
    format: String,
  },
  "health.diskMinFreePercent": {
    key: "health.diskMinFreePercent",
    section: "health",
    label: "Espacio libre mínimo en disco",
    description:
      "Porcentaje de espacio libre por debajo del cual el disco se marca como degradado. El estado crítico se calcula como la mitad de este valor, así que bajarlo también baja el crítico.",
    type: "number",
    defaultValue: 15,
    envFallback: () => intEnvOr("HEALTH_DISK_MIN_FREE_PERCENT", 15),
    unit: "%",
    min: 1,
    max: 99,
    parse: parseNumber,
    format: String,
  },
  "health.checkIntervalMinutes": {
    key: "health.checkIntervalMinutes",
    section: "health",
    label: "Cada cuánto revisa el vigilante",
    description:
      "Minutos entre una revisión de salud y la siguiente. El intervalo se lee al programar la tarea, así que el cambio solo surte efecto al reiniciar el servicio.",
    type: "number",
    defaultValue: 2,
    // The environment still speaks seconds and the domain is minutes, so a field
    // labelled "segundos" with a minimum of 30 would be a lie. Sub-minute
    // values cannot reach a minute-resolution cron anyway.
    envFallback: () =>
      Math.max(1, Math.ceil(intEnvOr("HEALTH_CHECK_INTERVAL_SECONDS", 120) / 60)),
    unit: "min",
    min: 1,
    max: 60,
    parse: parseNumber,
    format: String,
    requiresRestart: true,
  },
  "health.nowPlayingSilenceSeconds": {
    key: "health.nowPlayingSilenceSeconds",
    section: "health",
    label: "Silencio en la emisión",
    description:
      "Segundos que la emisión puede pasar sin avanzar una pista antes de marcar el AutoDJ como degradado. Solo aplica al AutoDJ: una persona en directo se considera sana.",
    type: "number",
    defaultValue: 900,
    envFallback: () => intEnvOr("HEALTH_NOW_PLAYING_SILENCE_SECONDS", 900),
    unit: "s",
    min: 60,
    max: 86400,
    parse: parseNumber,
    format: String,
  },
  "health.backupMaxAgeHours": {
    key: "health.backupMaxAgeHours",
    section: "health",
    label: "Antigüedad máxima de un respaldo",
    description:
      "Horas sin un respaldo nuevo antes de que la verificación de respaldos pase a estado crítico.",
    type: "number",
    defaultValue: 26,
    envFallback: () => intEnvOr("HEALTH_BACKUP_MAX_AGE_HOURS", 26),
    unit: "h",
    min: 1,
    max: 720,
    parse: parseNumber,
    format: String,
  },
  "health.snapshotMaxAgeHours": {
    key: "health.snapshotMaxAgeHours",
    section: "health",
    label: "Antigüedad máxima del muestreo de oyentes",
    description:
      "Horas sin una muestra nueva de oyentes antes de que el muestreo se marque como degradado. Si nunca se ha registrado ninguna muestra, el aviso aparece de inmediato.",
    type: "number",
    defaultValue: 2,
    envFallback: () => intEnvOr("HEALTH_SNAPSHOT_MAX_AGE_HOURS", 2),
    unit: "h",
    min: 1,
    max: 720,
    parse: parseNumber,
    format: String,
  },
  "health.pushEnabled": {
    key: "health.pushEnabled",
    section: "health",
    label: "Enviar alertas de salud a los dispositivos",
    description:
      "Cuando está activo, el vigilante envía una notificación push a los dispositivos registrados. Solo a los del servidor: la lista de dispositivos se sigue configuring fuera del panel.",
    type: "boolean",
    defaultValue: false,
    envFallback: () => boolEnvOr("HEALTH_PUSH_ENABLED", false),
    parse: parseBoolean,
    format: String,
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS_CATALOG;

/** The paint order of the panel page. Later sections are appended here. */
export const SETTING_SECTIONS: ReadonlyArray<{
  id: SettingSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "health",
    label: "Salud",
    description: "Cuándo el vigilante considera que algo anda mal y a quién avisa.",
  },
];

/**
 * Own properties only. `SETTINGS_CATALOG` is an object literal, so a
 * request-derived key such as "constructor" or "toString" would otherwise
 * resolve to something inherited. A definition is an own entry and nothing
 * else: reading `sensitive` off an inherited function writes a secret in clear
 * text, and an inherited value leaves the validator's type switch with nothing
 * to match.
 */
export function getDefinition(key: string): SettingDefinition | null {
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_CATALOG, key)) return null;
  return (SETTINGS_CATALOG as Record<string, SettingDefinition>)[key];
}

/** Accepts the four spellings a panel and an operator produce alike. */
function parseBoolean(raw: string): boolean {
  const normalized = raw.toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(`Not a boolean: "${raw}"`);
}

/** Rejects an empty string, which `Number` would otherwise read as zero. */
function parseNumber(raw: string): number {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(value)) {
    throw new Error(`Not a number: "${raw}"`);
  }
  return value;
}
