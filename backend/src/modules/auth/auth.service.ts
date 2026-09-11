import axios from "axios";
import jwt from "jsonwebtoken";
import type { AdminPermission, AdminRole } from "@radio/types";
import { config } from "../../config";
import { AppError } from "../../shared/errors/app-error";
import { getFirebaseAdmin } from "../../infrastructure/firebase/firebase-admin";
import { logger } from "../../shared/logger/logger";
import { AZURACAST_BASE_URL_TIMEOUTS } from "../../shared/constants";
import {
  effectivePermissions,
  normalizeEmail,
} from "./permissions";
import {
  ensureBootstrapAdmins,
  getAdminUserByEmail,
  recordLogin,
  type AdminUserRecord,
} from "./adminUsers.service";

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
  stationName: string;
  role: AdminRole;
  permissions: AdminPermission[];
  tv: number;
}

interface FirebaseProfile {
  email: string;
  name: string;
  picture: string;
}

const DEFAULT_STATION_NAME = "Radio";

/**
 * Verifies a Firebase ID token and returns the profile it represents.
 * Requires a Google sign-in with verified email. Throws 500 when Firebase
 * is not configured, 401 when the token is invalid, 403 when the Google
 * account itself is not verified.
 */
export async function verifyFirebaseCredential(credential: string): Promise<FirebaseProfile> {
  const admin = getFirebaseAdmin();
  if (!admin) {
    throw new AppError(500, "Firebase Auth no esta configurado en el servidor.");
  }

  try {
    const decoded = await admin.auth().verifyIdToken(credential);
    const email = normalizeEmail(decoded.email ?? "");

    if (!email) {
      throw new AppError(401, "Token de Firebase invalido");
    }

    const provider = decoded.firebase?.sign_in_provider ?? "";
    if (provider && provider !== "google.com") {
      throw new AppError(403, "Solo se permite el ingreso con cuentas de Google.");
    }

    if (decoded.email_verified === false) {
      throw new AppError(403, "Tu cuenta de Google no esta verificada.");
    }

    return {
      email,
      name: decoded.name ?? decoded.email ?? "",
      picture: decoded.picture ?? "",
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("AuthService", "Error verifying Firebase token", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(401, "Error al verificar el token de Firebase");
  }
}

/**
 * Fetches the AzuraCast station name, falling back to a default
 * when AzuraCast is unreachable. Best-effort, never throws.
 */
export async function fetchStationName(): Promise<string> {
  try {
    const response = await axios.get(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}`,
      {
        headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
        timeout: AZURACAST_BASE_URL_TIMEOUTS.nowPlaying,
      }
    );
    return response.data?.name ?? DEFAULT_STATION_NAME;
  } catch {
    return DEFAULT_STATION_NAME;
  }
}

/**
 * Builds a session token for an authorized admin user.
 */
export function createAdminSession(
  record: AdminUserRecord,
  stationName: string
): { token: string; user: SessionPayload } {
  const sessionPayload: SessionPayload = {
    sub: record.id,
    email: record.email,
    name: record.name || record.email,
    picture: record.picture,
    stationName,
    role: record.role,
    permissions: effectivePermissions(record.role, record.permissions),
    tv: record.tokenVersion,
  };

  const token = jwt.sign(sessionPayload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  return { token, user: sessionPayload };
}

/**
 * Full Google login: verifies Firebase, resolves the DB user and issues
 * a session JWT. Unknown or inactive emails get a generic 403 so the
 * endpoint does not reveal which accounts exist.
 */
export async function authenticateGoogleCredential(
  credential: string
): Promise<{ token: string; user: SessionPayload }> {
  const profile = await verifyFirebaseCredential(credential);
  await ensureBootstrapAdmins();

  const record = await getAdminUserByEmail(profile.email);
  if (!record || !record.isActive) {
    logger.warn("AuthService", "Login rechazado", { email: profile.email });
    throw new AppError(403, "Tu cuenta no tiene acceso al panel de administracion.");
  }

  await recordLogin(record.id, profile.name, profile.picture);
  const stationName = await fetchStationName();
  const fresh: AdminUserRecord = {
    ...record,
    name: profile.name || record.name,
    picture: profile.picture || record.picture,
  };
  return createAdminSession(fresh, stationName);
}
