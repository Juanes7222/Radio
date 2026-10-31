import { boolEnvOr, envOr, floatEnvOr, intEnvOr, keyValueEnvOr } from "../../config/env";
import { formatVoiceMap, parseVoiceMap } from "../locutor/tts/voiceMap";
import type { SettingDefinition, SettingSectionId, SettingValue } from "./settings.types";

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
  "announcements.perDay": {
    key: "announcements.perDay",
    section: "announcements",
    label: "Avisos por día",
    description:
      "Cuántos avisos de hora pueden sonar en un día. Cuenta solo los emitidos: un slot bloqueado por un programa o por una persona no gasta cupo.",
    type: "number",
    defaultValue: 12,
    envFallback: () => intEnvOr("ANNOUNCEMENTS_PER_DAY", 12),
    unit: "avisos",
    min: 1,
    max: 96,
    parse: parseNumber,
    format: String,
  },
  "announcements.activeFromHour": {
    key: "announcements.activeFromHour",
    section: "announcements",
    label: "Primera hora con avisos",
    description:
      "Hora de estación desde la que se siembran avisos. Fuera de esta franja no se sortea ninguno.",
    type: "number",
    defaultValue: 0,
    envFallback: () => intEnvOr("ANNOUNCEMENTS_ACTIVE_FROM_HOUR", 0),
    unit: "h",
    min: 0,
    max: 23,
    parse: parseNumber,
    format: String,
  },
  "announcements.activeToHour": {
    key: "announcements.activeToHour",
    section: "announcements",
    label: "Última hora con avisos",
    description:
      "Hora de estación en la que deja de sembrarse. 24 significa hasta medianoche.",
    type: "number",
    defaultValue: 24,
    envFallback: () => intEnvOr("ANNOUNCEMENTS_ACTIVE_TO_HOUR", 24),
    unit: "h",
    min: 1,
    max: 24,
    parse: parseNumber,
    format: String,
  },
  "announcements.programRetries": {
    key: "announcements.programRetries",
    section: "announcements",
    label: "Reintentos por programa en curso",
    description:
      "Cuántas veces se reevalúa un aviso bloqueado por un programa. La persona en vivo no reintenta: no es una condición pasajera.",
    type: "number",
    defaultValue: 3,
    envFallback: () => intEnvOr("ANNOUNCEMENTS_PROGRAM_RETRIES", 3),
    unit: "intentos",
    min: 0,
    max: 20,
    parse: parseNumber,
    format: String,
  },
  "announcements.stuckLiveMinutes": {
    key: "announcements.stuckLiveMinutes",
    section: "announcements",
    label: "Minutos antes de liberar el puerto en vivo",
    description:
      "El vigilante desconecta un live del propio locutor que lleve este tiempo sin un aviso en curso. Nunca toca a una persona.",
    type: "number",
    defaultValue: 5,
    envFallback: () => intEnvOr("ANNOUNCEMENTS_STUCK_LIVE_MINUTES", 5),
    unit: "min",
    min: 1,
    max: 120,
    parse: parseNumber,
    format: String,
  },
  "voice.provider": {
    key: "voice.provider",
    section: "voice",
    label: "Motor de voz",
    description:
      "auto intenta ElevenLabs y cae a Kokoro; elevenlabs no cae, para que un problema de configuración se vea; kokoro ahorra cuota a propósito.",
    type: "text",
    defaultValue: "auto",
    envFallback: () => envOr("TTS_PROVIDER", "auto"),
    parse: parseProvider,
    format: String,
  },
  "voice.elevenLabsModel": {
    key: "voice.elevenLabsModel",
    section: "voice",
    label: "Modelo de ElevenLabs",
    description: "Modelo de síntesis. Cambiarlo cambia el timbre y el consumo de caracteres.",
    type: "text",
    defaultValue: "eleven_multilingual_v2",
    envFallback: () => envOr("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
    parse: parseText,
    format: String,
  },
  "voice.elevenLabsStability": {
    key: "voice.elevenLabsStability",
    section: "voice",
    label: "Estabilidad de la voz",
    description:
      "Cuánto se parece cada locución a la anterior. Bajo suena más expresivo y menos predecible.",
    type: "number",
    defaultValue: 0.5,
    envFallback: () => floatEnvOr("ELEVENLABS_STABILITY", 0.5),
    min: 0,
    max: 1,
    parse: parseNumber,
    format: String,
  },
  "voice.elevenLabsSimilarity": {
    key: "voice.elevenLabsSimilarity",
    section: "voice",
    label: "Similitud con la voz original",
    description: "Cuánto se fuerza el parecido con la muestra de la voz clonada.",
    type: "number",
    defaultValue: 0.75,
    envFallback: () => floatEnvOr("ELEVENLABS_SIMILARITY_BOOST", 0.75),
    min: 0,
    max: 1,
    parse: parseNumber,
    format: String,
  },
  "voice.elevenLabsOutputFormat": {
    key: "voice.elevenLabsOutputFormat",
    section: "voice",
    label: "Formato de salida",
    description: "Formato que se pide al proveedor. mp3_44100_128 es el que espera el harbor.",
    type: "text",
    defaultValue: "mp3_44100_128",
    envFallback: () => envOr("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128"),
    parse: parseText,
    format: String,
  },
  "voice.defaultVoiceId": {
    key: "voice.defaultVoiceId",
    section: "voice",
    label: "Voz por defecto",
    description:
      "Id de ElevenLabs que se usa cuando la plantilla no aparece en el mapa de voces. Vacío significa que ninguna plantilla sin mapear puede usar ElevenLabs.",
    type: "text",
    defaultValue: "",
    envFallback: () => envOr("ELEVENLABS_DEFAULT_VOICE_ID", ""),
    parse: parseText,
    format: String,
  },
  "voice.voiceMap": {
    key: "voice.voiceMap",
    section: "voice",
    label: "Mapa de voces",
    description:
      "Pares etiqueta=id separados por coma, por ejemplo ef_dora=<id>,em_alex=<id>. La etiqueta es la que llevan las plantillas.",
    type: "text",
    defaultValue: "",
    envFallback: () => formatVoiceMap(keyValueEnvOr("ELEVENLABS_VOICE_IDS")),
    parse: parseVoiceMapSetting,
    format: formatVoiceMapSetting,
  },
  "voice.kokoroUrl": {
    key: "voice.kokoroUrl",
    section: "voice",
    label: "URL de Kokoro",
    description: "Servicio local de síntesis que actúa como respaldo y como motor barato.",
    type: "text",
    defaultValue: "http://localhost:8880",
    envFallback: () => envOr("KOKORO_URL", "http://localhost:8880"),
    parse: parseText,
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
  {
    id: "announcements",
    label: "Avisos de hora",
    description: "Cuántos avisos suenan al día, en qué franja y cómo se reintentan.",
  },
  {
    id: "voice",
    label: "Voz",
    description: "Motor de síntesis, voces y parámetros del proveedor.",
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

/** El panel solo puede guardar uno de los tres modos que el servicio entiende. */
function parseProvider(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === "auto" || value === "elevenlabs" || value === "kokoro") return value;
  throw new Error(`Motor de voz desconocido: "${raw}"`);
}

/** Texto sin recortar el contenido, salvo los espacios de los extremos. */
function parseText(raw: string): string {
  return raw.trim();
}

/**
 * El mapa se valida aquí y se guarda tal cual: `parseVoiceMap` lanza en un par
 * mal formado, y el guardado del panel lo convierte en un 400 en vez de dejar
 * medio mapa almacenado.
 */
function parseVoiceMapSetting(raw: string): string {
  parseVoiceMap(raw);
  return raw.trim();
}

function formatVoiceMapSetting(value: SettingValue): string {
  return typeof value === "string" ? formatVoiceMap(parseVoiceMap(value)) : "";
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
