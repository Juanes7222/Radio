import axios from "axios";
import { config } from "../../config";
import { prisma } from "../../infrastructure/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { BOGOTA_TIME_ZONE } from "../../shared/utils/date";
import { normalizeEmail, isValidEmail } from "../auth/permissions";
import { getAdminUserByEmail, getAdminUserById } from "../auth/adminUsers.service";

export interface LiveSlot {
  /** Day of week 1-7, 1 = Monday. */
  dow: number;
  /** 24h "HH:MM" in America/Bogota. */
  start: string;
  /** 24h "HH:MM" in America/Bogota, must be after start (same day). */
  end: string;
}

export interface StreamerAccount {
  id: number;
  username: string;
  displayName: string;
  isActive: boolean;
  enforceSchedule: boolean;
  /** Server-side only: never send to the browser. */
  password: string;
}

interface RawAssignment {
  id: string;
  streamerUsername: string;
  adminUserId: string;
  slots: string;
  isActive: boolean;
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  adminUser?: { email: string; name: string; isActive: boolean } | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function parseSlots(value: unknown): LiveSlot[] {
  if (!Array.isArray(value)) throw new AppError(400, "Franjas inválidas");
  if (value.length > 21) throw new AppError(400, "Máximo 21 franjas por asignación");
  const seen = new Set<string>();
  const slots: LiveSlot[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") throw new AppError(400, "Franja inválida");
    const { dow, start, end } = item as Record<string, unknown>;
    if (!Number.isInteger(dow) || (dow as number) < 1 || (dow as number) > 7) {
      throw new AppError(400, "Día de franja inválido (1-7, 1 = lunes)");
    }
    if (typeof start !== "string" || !TIME_PATTERN.test(start)) {
      throw new AppError(400, "Hora de inicio inválida (HH:MM)");
    }
    if (typeof end !== "string" || !TIME_PATTERN.test(end)) {
      throw new AppError(400, "Hora de fin inválida (HH:MM)");
    }
    if (toMinutes(end) <= toMinutes(start)) {
      throw new AppError(400, "La franja debe terminar el mismo día después de iniciar");
    }
    const key = `${dow}-${start}-${end}`;
    if (seen.has(key)) throw new AppError(400, "Franja duplicada");
    seen.add(key);
    slots.push({ dow: dow as number, start, end });
  }
  return slots;
}

function getClient(): any {
  return prisma as any;
}

function parseStoredSlots(raw: string): LiveSlot[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return (parsed as LiveSlot[]).filter(
      (s) =>
        Number.isInteger(s.dow) &&
        typeof s.start === "string" &&
        typeof s.end === "string"
    );
  } catch {
    return [];
  }
}

/** Current weekday (1-7, Monday first) and minutes since midnight in Bogota. */
export function getBogotaNow(): { dow: number; minutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOGOTA_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const dowMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { dow: dowMap[weekday] ?? 1, minutes: hour * 60 + minute };
}

export function isInSlot(slots: LiveSlot[], now = getBogotaNow()): boolean {
  return slots.some(
    (s) => s.dow === now.dow && toMinutes(s.start) <= now.minutes && now.minutes < toMinutes(s.end)
  );
}

export function currentSlotEnd(slots: LiveSlot[], now = getBogotaNow()): string | null {
  const current = slots.find(
    (s) => s.dow === now.dow && toMinutes(s.start) <= now.minutes && now.minutes < toMinutes(s.end)
  );
  return current ? current.end : null;
}

function toPublicAssignment(row: RawAssignment, now = getBogotaNow()) {
  const slots = parseStoredSlots(row.slots);
  return {
    id: row.id,
    streamerUsername: row.streamerUsername,
    adminUserId: row.adminUserId,
    email: row.adminUser?.email ?? "",
    name: row.adminUser?.name ?? "",
    userActive: row.adminUser?.isActive ?? false,
    slots,
    isActive: row.isActive,
    inSlot: row.isActive && isInSlot(slots, now),
    slotEndsAt: row.isActive ? currentSlotEnd(slots, now) : null,
    assignedBy: row.assignedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Fetches a streamer account from AzuraCast, including its source password.
 * Server-side only: the password must never leave the backend.
 */
export async function findStreamer(username: string): Promise<StreamerAccount | null> {
  const target = username.trim();
  if (!target) return null;
  try {
    const response = await axios.get(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/streamers`,
      {
        headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
        timeout: 10_000,
      }
    );
    const list = Array.isArray(response.data) ? response.data : [];
    const match = list.find(
      (s: any) =>
        typeof s?.streamer_username === "string" &&
        s.streamer_username.toLowerCase() === target.toLowerCase()
    );
    if (!match) return null;
    return {
      id: Number(match.id),
      username: String(match.streamer_username),
      displayName: String(match.display_name ?? match.streamer_username),
      isActive: match.is_active !== false,
      enforceSchedule: match.enforce_schedule === true,
      password: String(match.streamer_password ?? ""),
    };
  } catch (err) {
    logger.error("DjService", "No se pudo consultar streamers en AzuraCast", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(502, "AzuraCast no disponible para validar el DJ");
  }
}

export async function listStreamers(): Promise<Omit<StreamerAccount, "password">[]> {
  try {
    const response = await axios.get(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/streamers`,
      {
        headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
        timeout: 10_000,
      }
    );
    const list = Array.isArray(response.data) ? response.data : [];
    return list.map((s: any) => ({
      id: Number(s.id),
      username: String(s.streamer_username ?? ""),
      displayName: String(s.display_name ?? s.streamer_username ?? ""),
      isActive: s.is_active !== false,
      enforceSchedule: s.enforce_schedule === true,
    }));
  } catch (err) {
    logger.error("DjService", "No se pudo listar streamers en AzuraCast", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(502, "AzuraCast no disponible");
  }
}

export async function listAssignments() {
  const now = getBogotaNow();
  const rows = (await getClient().djAssignment.findMany({
    include: { adminUser: { select: { email: true, name: true, isActive: true } } },
    orderBy: { createdAt: "desc" },
  })) as RawAssignment[];
  return rows.map((r) => toPublicAssignment(r, now));
}

interface AssignInput {
  streamerUsername: string;
  email: string;
  slots: unknown;
  assignedBy?: string | null;
}

export async function createAssignment(input: AssignInput) {
  const streamerUsername = input.streamerUsername.trim();
  if (!streamerUsername) throw new AppError(400, "DJ requerido");
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new AppError(400, "Correo inválido");
  const slots = parseSlots(input.slots);

  const streamer = await findStreamer(streamerUsername);
  if (!streamer) {
    throw new AppError(404, "Ese DJ no existe en AzuraCast, créalo primero en Streaming / DJs");
  }
  const user = await getAdminUserByEmail(email);
  if (!user) {
    throw new AppError(404, "Ese correo no tiene usuario en el panel, créalo en Usuarios");
  }
  if (!user.isActive) throw new AppError(400, "Ese usuario está desactivado");

  const existing = await getClient().djAssignment.findUnique({
    where: {
      streamerUsername_adminUserId: { streamerUsername: streamer.username, adminUserId: user.id },
    },
  });
  if (existing) throw new AppError(409, "Ese usuario ya está asignado a ese DJ");

  const row = (await getClient().djAssignment.create({
    data: {
      streamerUsername: streamer.username,
      adminUserId: user.id,
      slots: JSON.stringify(slots),
      assignedBy: input.assignedBy ?? null,
    },
    include: { adminUser: { select: { email: true, name: true, isActive: true } } },
  })) as RawAssignment;
  logger.info("DjService", "DJ asignado", {
    streamer: streamer.username,
    email,
    by: input.assignedBy ?? null,
  });
  return toPublicAssignment(row);
}

export async function updateAssignment(id: string, input: { slots?: unknown; isActive?: unknown }) {
  const current = (await getClient().djAssignment.findUnique({
    where: { id },
    include: { adminUser: { select: { email: true, name: true, isActive: true } } },
  })) as RawAssignment | null;
  if (!current) throw new AppError(404, "Asignación no encontrada");

  const data: Record<string, unknown> = {};
  if (input.slots !== undefined) data.slots = JSON.stringify(parseSlots(input.slots));
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") throw new AppError(400, "isActive inválido");
    data.isActive = input.isActive;
  }
  if (Object.keys(data).length === 0) return toPublicAssignment(current);

  const row = (await getClient().djAssignment.update({
    where: { id },
    data,
    include: { adminUser: { select: { email: true, name: true, isActive: true } } },
  })) as RawAssignment;
  return toPublicAssignment(row);
}

export async function deleteAssignment(id: string): Promise<void> {
  const current = await getClient().djAssignment.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "Asignación no encontrada");
  await getClient().djAssignment.delete({ where: { id } });
  logger.info("DjService", "Asignación eliminada", {
    streamer: (current as RawAssignment).streamerUsername,
  });
}

export async function getMyAssignments(adminUserId: string) {
  const user = await getAdminUserById(adminUserId);
  if (!user || !user.isActive) throw new AppError(401, "Cuenta desactivada");
  const now = getBogotaNow();
  const rows = (await getClient().djAssignment.findMany({
    where: { adminUserId, isActive: true },
    include: { adminUser: { select: { email: true, name: true, isActive: true } } },
    orderBy: { createdAt: "desc" },
  })) as RawAssignment[];
  return {
    now,
    rows: rows.map((r) => toPublicAssignment(r, now)),
  };
}
