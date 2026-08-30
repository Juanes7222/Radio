import axios from "axios";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { AppError } from "../../shared/errors/app-error";
import { getFirebaseAdmin } from "../../infrastructure/firebase/firebase-admin";
import { logger } from "../../shared/logger/logger";
import { AZURACAST_BASE_URL_TIMEOUTS } from "../../shared/constants";

export interface SessionPayload {
  email: string;
  name: string;
  picture: string;
  stationName: string;
}

interface FirebaseProfile {
  email: string;
  name: string;
  picture: string;
}

const DEFAULT_STATION_NAME = "Radio";

/**
 * Verifies a Firebase ID token and returns the profile it represents.
 * Throws a 500 when Firebase is not configured, 401 when the token is invalid.
 */
export async function verifyFirebaseCredential(credential: string): Promise<FirebaseProfile> {
  const admin = getFirebaseAdmin();
  if (!admin) {
    throw new AppError(500, "Firebase Auth no esta configurado en el servidor.");
  }

  try {
    const decoded = await admin.auth().verifyIdToken(credential);
    const email = decoded.email ?? "";

    if (!email) {
      throw new AppError(401, "Token de Firebase invalido");
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
export function createAdminSession(profile: FirebaseProfile, stationName: string): { token: string; user: SessionPayload } {
  const sessionPayload: SessionPayload = {
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    stationName,
  };

  const token = jwt.sign(sessionPayload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  return { token, user: sessionPayload };
}
