import { prisma } from "../../infrastructure/database/prisma";
import { config } from "../../config";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import {
  effectivePermissions,
  isAdminRole,
  isValidEmail,
  normalizeEmail,
  parsePermissions,
  type AdminPermission,
  type AdminRole,
} from "./permissions";

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
  tokenVersion: number;
  createdBy: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RawAdminUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: string;
  permissions: string;
  isActive: boolean;
  tokenVersion: number;
  createdBy: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function getClient(): any {
  return prisma as any;
}

function toRecord(row: RawAdminUser): AdminUserRecord {
  const role: AdminRole = isAdminRole(row.role) ? row.role : "USER";
  let stored: AdminPermission[] = [];
  try {
    stored = parsePermissions(JSON.parse(row.permissions ?? "[]"));
  } catch {
    stored = [];
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? "",
    picture: row.picture ?? "",
    role,
    permissions: effectivePermissions(role, stored),
    isActive: row.isActive,
    tokenVersion: row.tokenVersion,
    createdBy: row.createdBy,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPublicUser(row: AdminUserRecord) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    role: row.role,
    permissions: row.permissions,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getAdminUserByEmail(email: string): Promise<AdminUserRecord | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const row = (await getClient().adminUser.findUnique({
    where: { email: normalized },
  })) as RawAdminUser | null;
  return row ? toRecord(row) : null;
}

export async function getAdminUserById(id: string): Promise<AdminUserRecord | null> {
  if (!id) return null;
  const row = (await getClient().adminUser.findUnique({
    where: { id },
  })) as RawAdminUser | null;
  return row ? toRecord(row) : null;
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const rows = (await getClient().adminUser.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
  })) as RawAdminUser[];
  return rows.map(toRecord);
}

export async function countActiveSuperadmins(exceptId?: string): Promise<number> {
  const rows = (await getClient().adminUser.findMany({
    where: { role: "SUPERADMIN", isActive: true },
    select: { id: true },
  })) as Array<{ id: string }>;
  return rows.filter((r) => r.id !== exceptId).length;
}

interface CreateInput {
  email: string;
  name?: string;
  role: AdminRole;
  permissions?: AdminPermission[];
  createdBy?: string | null;
}

export async function createAdminUser(input: CreateInput): Promise<AdminUserRecord> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new AppError(400, "Correo inválido");
  }
  if (!isAdminRole(input.role)) {
    throw new AppError(400, "Rol inválido");
  }
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  const permissions =
    input.role === "USER" ? parsePermissions(input.permissions ?? []) : [];

  const existing = await getAdminUserByEmail(email);
  if (existing) {
    throw new AppError(409, "Ya existe un usuario con ese correo");
  }

  const row = (await getClient().adminUser.create({
    data: {
      email,
      name,
      role: input.role,
      permissions: JSON.stringify(permissions),
      createdBy: input.createdBy ?? null,
    },
  })) as RawAdminUser;
  logger.info("AdminUsers", "Usuario creado", { email, role: input.role });
  return toRecord(row);
}

interface UpdateInput {
  name?: string;
  role?: AdminRole;
  permissions?: AdminPermission[];
  isActive?: boolean;
}

export async function updateAdminUser(
  id: string,
  input: UpdateInput,
  actorId: string
): Promise<AdminUserRecord> {
  const current = await getAdminUserById(id);
  if (!current) {
    throw new AppError(404, "Usuario no encontrado");
  }

  const data: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    data.name = input.name.trim().slice(0, 120);
  }
  if (typeof input.isActive === "boolean") {
    if (current.id === actorId && input.isActive === false) {
      throw new AppError(400, "No puedes desactivar tu propia cuenta");
    }
    if (
      current.role === "SUPERADMIN" &&
      current.isActive &&
      input.isActive === false &&
      (await countActiveSuperadmins(current.id)) === 0
    ) {
      throw new AppError(400, "No puedes desactivar el último superadmin activo");
    }
    data.isActive = input.isActive;
    if (input.isActive === false) {
      data.tokenVersion = { increment: 1 };
    }
  }
  if (input.role !== undefined) {
    if (!isAdminRole(input.role)) {
      throw new AppError(400, "Rol inválido");
    }
    if (current.id === actorId && input.role !== current.role) {
      throw new AppError(400, "No puedes cambiar tu propio rol");
    }
    if (
      current.role === "SUPERADMIN" &&
      input.role !== "SUPERADMIN" &&
      (await countActiveSuperadmins(current.id)) === 0
    ) {
      throw new AppError(400, "Debe quedar al menos un superadmin activo");
    }
    data.role = input.role;
    if (input.role !== "USER") {
      data.permissions = JSON.stringify([]);
    } else if (input.permissions !== undefined) {
      data.permissions = JSON.stringify(parsePermissions(input.permissions));
    }
    if (input.role !== current.role) {
      data.tokenVersion = { increment: 1 };
    }
  } else if (input.permissions !== undefined && current.role === "USER") {
    data.permissions = JSON.stringify(parsePermissions(input.permissions));
    data.tokenVersion = { increment: 1 };
  }

  if (Object.keys(data).length === 0) {
    return current;
  }

  const row = (await getClient().adminUser.update({
    where: { id },
    data,
  })) as RawAdminUser;
  logger.info("AdminUsers", "Usuario actualizado", { email: current.email });
  return toRecord(row);
}

export async function deleteAdminUser(id: string, actorId: string): Promise<void> {
  const current = await getAdminUserById(id);
  if (!current) {
    throw new AppError(404, "Usuario no encontrado");
  }
  if (current.id === actorId) {
    throw new AppError(400, "No puedes eliminar tu propia cuenta");
  }
  if (
    current.role === "SUPERADMIN" &&
    (await countActiveSuperadmins(current.id)) === 0
  ) {
    throw new AppError(400, "Debe quedar al menos un superadmin activo");
  }
  await getClient().adminUser.delete({ where: { id } });
  logger.info("AdminUsers", "Usuario eliminado", { email: current.email });
}

export async function revokeAdminSessions(id: string): Promise<AdminUserRecord> {
  const current = await getAdminUserById(id);
  if (!current) {
    throw new AppError(404, "Usuario no encontrado");
  }
  const row = (await getClient().adminUser.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
  })) as RawAdminUser;
  logger.info("AdminUsers", "Sesiones revocadas", { email: current.email });
  return toRecord(row);
}

export async function recordLogin(id: string, name: string, picture: string): Promise<void> {
  try {
    await getClient().adminUser.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        ...(name ? { name: name.slice(0, 120) } : {}),
        ...(picture ? { picture: picture.slice(0, 500) } : {}),
      },
    });
  } catch {
    // Best-effort: un fallo al registrar el login no bloquea el acceso.
  }
}

/**
 * Bootstrap inicial: si la tabla esta vacia, todos los correos de
 * ADMIN_WHITELIST (mas SUPERADMIN_EMAIL si esta definido) se crean como
 * SUPERADMIN. Solo corre cuando no hay usuarios, por lo que no puede
 * usarse para escalar privilegios una vez el sistema ya tiene datos.
 */
export async function ensureBootstrapAdmins(): Promise<{ seeded: boolean; count: number }> {
  const total = (await getClient().adminUser.count()) as number;
  if (total > 0) return { seeded: false, count: total };

  const superadmin = normalizeEmail(config.superadminEmail);
  const whitelist = (config.whitelist ?? [])
    .map((e) => normalizeEmail(e))
    .filter((e) => isValidEmail(e));

  const emails = new Set<string>();
  for (const email of whitelist) emails.add(email);
  if (superadmin && isValidEmail(superadmin)) emails.add(superadmin);
  if (emails.size === 0) return { seeded: false, count: 0 };

  let created = 0;
  for (const email of emails) {
    try {
      await getClient().adminUser.create({
        data: { email, role: "SUPERADMIN", permissions: JSON.stringify([]), createdBy: "bootstrap" },
      });
      created += 1;
    } catch {
      // Si dos arranques compiten, una creacion puede fallar por unique: se ignora.
    }
  }
  if (created > 0) {
    logger.info("AdminUsers", "Bootstrap de usuarios admin", {
      superadmins: [...emails],
      created,
    });
  }
  return { seeded: created > 0, count: created };
}
