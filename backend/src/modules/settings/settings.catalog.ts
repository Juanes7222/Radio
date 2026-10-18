import { boolEnvOr, intEnvOr } from "../../config/env";
import type { SettingDefinition } from "./settings.types";

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
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS_CATALOG;

export function getDefinition(key: string): SettingDefinition | null {
  return (SETTINGS_CATALOG as Record<string, SettingDefinition>)[key] ?? null;
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
