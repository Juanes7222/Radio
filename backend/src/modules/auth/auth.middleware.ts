import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AdminPermission } from "@radio/types";
import { config } from "../../config";
import type { SessionPayload } from "./auth.service";
import { getAdminUserById } from "./adminUsers.service";
import { effectivePermissions, hasPermission } from "./permissions";

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

interface TokenPayload {
  sub?: string;
  email?: string;
  tv?: number;
}

type SessionResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; status: number; error: string };

/**
 * Verifies the JWT and reloads the user from the database. Permissions and
 * active flag always come from the DB, so deactivating a user or changing
 * permissions takes effect immediately ( JWT tv mismatch forces re-login ).
 * Old tokens without sub are rejected to force a fresh login after the RBAC
 * migration.
 */
async function loadSession(req: Request): Promise<SessionResult> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "No autorizado" };
  }

  const token = header.slice(7);
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch {
    return { ok: false, status: 401, error: "Token inválido o expirado" };
  }

  if (!decoded.sub) {
    return { ok: false, status: 401, error: "Sesión anterior, vuelve a iniciar sesión" };
  }

  try {
    const record = await getAdminUserById(decoded.sub);
    if (!record || !record.isActive) {
      return { ok: false, status: 401, error: "Cuenta desactivada" };
    }
    if (decoded.tv !== undefined && decoded.tv !== record.tokenVersion) {
      return { ok: false, status: 401, error: "Sesión revocada, vuelve a iniciar sesión" };
    }

    const permissions = effectivePermissions(record.role, record.permissions);
    return {
      ok: true,
      session: {
        sub: record.id,
        email: record.email,
        name: record.name || record.email,
        picture: record.picture,
        stationName: (decoded as SessionPayload).stationName ?? "Radio",
        role: record.role,
        permissions,
        tv: record.tokenVersion,
      },
    };
  } catch {
    return { ok: false, status: 500, error: "Error al validar la sesión" };
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const result = await loadSession(req);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  req.session = result.session;
  next();
}

/**
 * Resolves a fully validated admin session without writing a response. Endpoints
 * that accept either an admin session or an object credential use it for the
 * admin branch, so a deactivated or revoked admin is treated like any other
 * caller without a valid credential. Returns null when there is no valid admin
 * session.
 */
export async function resolveAdminSession(req: Request): Promise<SessionPayload | null> {
  const result = await loadSession(req);
  return result.ok ? result.session : null;
}

export function requirePermission(...permissions: AdminPermission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session = req.session;
    if (!session) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const allowed = permissions.some((p) => hasPermission(session.role, session.permissions, p));
    if (!allowed) {
      res.status(403).json({ error: "No tienes permiso para esta sección" });
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.role !== "SUPERADMIN") {
    res.status(403).json({ error: "Solo el superadmin puede acceder a esta sección" });
    return;
  }
  next();
}
