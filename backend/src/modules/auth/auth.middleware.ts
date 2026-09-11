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

/**
 * Verifies the JWT and reloads the user from the database on every
 * request. Permissions and active flag always come from the DB, so
 * deactivating a user or changing permissions takes effect immediately
 * ( JWT tv mismatch forces re-login ). Old tokens without sub are
 * rejected to force a fresh login after the RBAC migration.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const token = header.slice(7);
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  if (!decoded.sub) {
    res.status(401).json({ error: "Sesión anterior, vuelve a iniciar sesión" });
    return;
  }

  try {
    const record = await getAdminUserById(decoded.sub);
    if (!record || !record.isActive) {
      res.status(401).json({ error: "Cuenta desactivada" });
      return;
    }
    if (decoded.tv !== undefined && decoded.tv !== record.tokenVersion) {
      res.status(401).json({ error: "Sesión revocada, vuelve a iniciar sesión" });
      return;
    }

    const permissions = effectivePermissions(record.role, record.permissions);
    req.session = {
      sub: record.id,
      email: record.email,
      name: record.name || record.email,
      picture: record.picture,
      stationName: (decoded as SessionPayload).stationName ?? "Radio",
      role: record.role,
      permissions,
      tv: record.tokenVersion,
    };
    next();
  } catch {
    res.status(500).json({ error: "Error al validar la sesión" });
  }
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
    res.status(403).json({ error: "Solo el superadmin puede gestionar usuarios" });
    return;
  }
  next();
}
