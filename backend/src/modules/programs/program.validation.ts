import { AppError } from "../../shared/errors/app-error";
import { SCHEDULE_MODES, type ScheduleMode } from "./program.constants";

function asObject(value: unknown, label = "El cuerpo"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError(400, `${label} debe ser un objeto JSON.`);
  }
  return value as Record<string, unknown>;
}

export function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new AppError(400, "Se esperaba un texto.");
  return value;
}

export function requiredName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError(400, "El nombre es obligatorio.");
  }
  if (value.trim().length > 120) {
    throw new AppError(400, "El nombre no puede superar los 120 caracteres.");
  }
  return value.trim();
}

export function optionalInteger(
  value: unknown,
  field: string,
  bounds: { min: number; max: number }
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new AppError(400, `${field} debe ser un número entero.`);
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    throw new AppError(400, `${field} debe estar entre ${bounds.min} y ${bounds.max}.`);
  }
  return parsed;
}

export function optionalFloat(
  value: unknown,
  field: string,
  bounds: { min: number; max: number }
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(400, `${field} debe ser un número.`);
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    throw new AppError(400, `${field} debe estar entre ${bounds.min} y ${bounds.max}.`);
  }
  return Math.round(parsed * 100) / 100;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  throw new AppError(400, `${field} debe ser verdadero o falso.`);
}

export function optionalScheduleMode(value: unknown): ScheduleMode | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const mode = SCHEDULE_MODES.find((candidate) => candidate === value);
  if (!mode) {
    throw new AppError(400, `Modo de programación inválido. Usa: ${SCHEDULE_MODES.join(", ")}.`);
  }
  return mode;
}

export function optionalDaysMask(value: unknown): number | undefined {
  const parsed = optionalInteger(value, "Los días", { min: 0, max: 0b1111111 });
  if (parsed === undefined) return undefined;
  if (parsed === 0) throw new AppError(400, "Selecciona al menos un día de emisión.");
  return parsed;
}

/** Parses the JSON body of the program creation endpoint. */
export function parseProgramCreateBody(body: unknown): {
  name: string;
  description?: string | null;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  scheduleMode?: ScheduleMode;
  daysMask?: number;
  airStart?: string | null;
  airEnd?: string | null;
  daysAhead?: number;
  leadMinutes?: number;
  bufferMinutes?: number;
  active?: boolean;
  fadeSeconds?: number;
} {
  const raw = asObject(body);

  return {
    name: requiredName(raw.name),
    description: optionalString(raw.description) ?? null,
    artist: optionalString(raw.artist) ?? null,
    album: optionalString(raw.album) ?? null,
    genre: optionalString(raw.genre) ?? null,
    scheduleMode: optionalScheduleMode(raw.scheduleMode),
    daysMask: optionalDaysMask(raw.daysMask),
    airStart: optionalString(raw.airStart) ?? null,
    airEnd: optionalString(raw.airEnd) ?? null,
    daysAhead: optionalInteger(raw.daysAhead, "Los días a buscar", { min: 1, max: 60 }),
    leadMinutes: optionalInteger(raw.leadMinutes, "El margen de antelación", {
      min: 0,
      max: 1440,
    }),
    bufferMinutes: optionalInteger(raw.bufferMinutes, "El margen entre programas", {
      min: 0,
      max: 60,
    }),
    active: optionalBoolean(raw.active, "El estado del programa"),
    fadeSeconds: optionalFloat(raw.fadeSeconds, "El fundido", { min: 0, max: 5 }),
  };
}

/** Parses the JSON body of the program update endpoint. */
export function parseProgramUpdateBody(body: unknown): Record<string, unknown> {
  const raw = asObject(body);
  const parsed = parseProgramCreateBody({ ...raw, name: raw.name ?? "" });
  const data: Record<string, unknown> = {};

  if (raw.name !== undefined) data.name = parsed.name;
  if (raw.description !== undefined) data.description = parsed.description;
  if (raw.artist !== undefined) data.artist = parsed.artist;
  if (raw.album !== undefined) data.album = parsed.album;
  if (raw.genre !== undefined) data.genre = parsed.genre;
  if (raw.scheduleMode !== undefined) data.scheduleMode = parsed.scheduleMode;
  if (raw.daysMask !== undefined) data.daysMask = parsed.daysMask;
  if (raw.airStart !== undefined) data.airStart = parsed.airStart;
  if (raw.airEnd !== undefined) data.airEnd = parsed.airEnd;
  if (raw.daysAhead !== undefined) data.daysAhead = parsed.daysAhead;
  if (raw.leadMinutes !== undefined) data.leadMinutes = parsed.leadMinutes;
  if (raw.bufferMinutes !== undefined) data.bufferMinutes = parsed.bufferMinutes;
  if (raw.active !== undefined) data.active = parsed.active;
  if (raw.fadeSeconds !== undefined) data.fadeSeconds = parsed.fadeSeconds;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, "No se recibió ningún campo para actualizar.");
  }
  return data;
}

/** Parses the multipart fields of an episode upload. */
export function parseEpisodeBody(body: Record<string, unknown> | undefined): {
  title?: string | null;
  dayIndex?: number | null;
  startTime?: string | null;
  normalizeLoudness: boolean;
  reduceNoise: boolean;
} {
  const raw = asObject(body ?? {}, "El formulario");
  const dayIndex = optionalInteger(raw.dayIndex, "El día de emisión", { min: 1, max: 7 });

  return {
    title: optionalString(raw.title) ?? null,
    dayIndex: dayIndex ?? null,
    startTime: optionalString(raw.startTime) ?? null,
    normalizeLoudness:
      optionalBoolean(raw.normalizeLoudness, "La normalización de volumen") ?? false,
    reduceNoise: optionalBoolean(raw.reduceNoise, "La reducción de ruido") ?? false,
  };
}