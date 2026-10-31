import net from "net";
import fs from "fs";
import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { STATION_ID } from "../azuracast/azuracast.client";
import { getSettings } from "./settings.service";

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
});

const HARBOR_HOST = config.locutor.harborHost;
const HARBOR_PORT = config.locutor.harborPort;
const MOUNT_POINT = config.locutor.mountPoint;

/**
 * Username the account is created with when the panel has no credentials. It is
 * the login, not what AzuraCast reports: `nowplaying.live.streamer_name` carries
 * the display name, and the account is created with the station name.
 */
const DEFAULT_STREAMER_USERNAME = "avsisos_auto";

/** Floor for the stream timeout. A short notice still needs the old 30 s. */
const MIN_STREAM_TIMEOUT_MS = 30_000;

/** Added to the file duration so the socket is not cut while audio is pending. */
const STREAM_TIMEOUT_MARGIN_MS = 15_000;

/** The identity lookup costs one API call, so it is reused across slots. */
const IDENTITY_TTL_MS = 5 * 60_000;

interface StreamerDto {
  id: number;
  streamer_username: string;
  display_name?: string | null;
}

let generatedCredentials: { username: string; password: string } | null = null;
let identityCache: { at: number; values: Set<string> } | null = null;
let announcementInFlight = false;

/** Same folding as liveState: accents and case must not decide identity. */
export function normalizeStreamerName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u030f]/g, "")
    .trim();
}

function generatePassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function fetchStreamers(): Promise<StreamerDto[]> {
  const { data } = await azApi.get<StreamerDto[]>(`/station/${STATION_ID}/streamers`, {
    timeout: 8_000,
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Credentials written from the panel win over the environment: the settings row
 * is what the operator can change without a deploy.
 */
async function configuredCredentials(): Promise<{ username: string; password: string } | null> {
  let settingsUser: string | null = null;
  let settingsPassword: string | null = null;

  try {
    const settings = await getSettings();
    settingsUser = settings.streamerUser;
    settingsPassword = settings.streamerPassword;
  } catch (err) {
    logger.warn("LocutorStreamer", "Could not read the streamer settings", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const username = settingsUser ?? (config.locutor.streamerUser || null);
  const password = settingsPassword ?? (config.locutor.streamerPassword || null);

  return username && password ? { username, password } : null;
}

export async function getOrCreateAnnouncementStreamer(): Promise<{
  username: string;
  password: string;
}> {
  const configured = await configuredCredentials();
  if (configured) return configured;

  if (generatedCredentials) return generatedCredentials;

  const streamers = await fetchStreamers();
  const existing = streamers.find((s) => s.streamer_username === DEFAULT_STREAMER_USERNAME);

  if (existing) {
    throw new Error(
      `La cuenta de locutor "${DEFAULT_STREAMER_USERNAME}" ya existe en AzuraCast y no hay ` +
        "contraseña guardada. Escríbela en los ajustes de avisos del panel (usuario y contraseña " +
        "del locutor) para que el sistema pueda emitir."
    );
  }

  const password = generatePassword();
  const { data } = await azApi.post<StreamerDto>(`/station/${STATION_ID}/streamers`, {
    streamer_username: DEFAULT_STREAMER_USERNAME,
    streamer_password: password,
    display_name: config.locutor.stationName,
    comments: "Automatic account for hourly announcements",
    is_active: true,
    enforce_schedule: false,
  });

  generatedCredentials = { username: DEFAULT_STREAMER_USERNAME, password };

  logger.info(
    "LocutorStreamer",
    `Streamer created: ${DEFAULT_STREAMER_USERNAME} (ID ${data.id})`
  );

  return generatedCredentials;
}

/**
 * Every name AzuraCast may report for the announcement account: the login, the
 * configured login and the display name of the matching account. Without the
 * display name the station's own source reads as a human and is never released,
 * which is what kept the harbour busy for a day.
 */
export async function getAnnouncementStreamerIdentities(): Promise<Set<string>> {
  if (identityCache && Date.now() - identityCache.at < IDENTITY_TTL_MS) {
    return identityCache.values;
  }

  const values = new Set<string>();
  const add = (value: string | null | undefined): void => {
    if (typeof value === "string" && value.trim().length > 0) {
      values.add(normalizeStreamerName(value));
    }
  };

  add(DEFAULT_STREAMER_USERNAME);
  add(config.locutor.stationName);

  const configured = await configuredCredentials();
  add(configured?.username ?? null);
  add(config.locutor.streamerUser || null);

  try {
    const streamers = await fetchStreamers();
    const usernames = new Set([...values]);
    for (const streamer of streamers) {
      if (!usernames.has(normalizeStreamerName(streamer.streamer_username))) continue;
      add(streamer.display_name);
    }
  } catch (err) {
    // The login is still recognized. Losing the display name only means the
    // account cannot be told apart when it broadcasts under the station name.
    logger.warn("LocutorStreamer", "Could not read the streamer list", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  identityCache = { at: Date.now(), values };
  return values;
}

/** Drops the cached identity and credentials after a settings change. */
export function invalidateAnnouncementStreamerCache(): void {
  identityCache = null;
  generatedCredentials = null;
}

/** True between the moment a notice starts and the moment its run settles. */
export function markAnnouncementStarted(): void {
  announcementInFlight = true;
}

export function markAnnouncementFinished(): void {
  announcementInFlight = false;
}

export function isAnnouncementInFlight(): boolean {
  return announcementInFlight;
}

function streamMp3AsLive(
  username: string,
  password: string,
  filePath: string,
  durationMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const fileSize = fs.statSync(filePath).size;
    // A fixed 30 s timer cut any notice longer than half a minute while the
    // socket was still writing, which is how a stuck source gets created.
    const timeoutMs = Math.max(MIN_STREAM_TIMEOUT_MS, durationMs + STREAM_TIMEOUT_MARGIN_MS);
    const readStream = fs.createReadStream(filePath);
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const socket = new net.Socket();
    let serverResponse = "";
    let closed = false;

    function finish(err?: Error) {
      if (closed) return;
      closed = true;
      socket.destroy();
      readStream.destroy();
      if (err) reject(err);
      else resolve();
    }

    socket.connect(HARBOR_PORT, HARBOR_HOST, () => {
      logger.info("LocutorStreamer", "Connected to harbor, sending headers");

      const headers = [
        `SOURCE ${MOUNT_POINT} HTTP/1.0`,
        `Content-Type: audio/mpeg`,
        `Authorization: Basic ${auth}`,
        `Content-Length: ${fileSize}`,
        `Ice-Public: 0`,
        `Ice-Name: Automatic Locutor`,
      ].join("\r\n");

      socket.write(headers + "\r\n\r\n");

      readStream.pipe(socket, { end: true });
      logger.info("LocutorStreamer", "Streaming MP3...", { sizeBytes: fileSize, timeoutMs });
    });

    socket.on("data", (data: Buffer) => {
      const text = data.toString("utf8").trim();
      serverResponse += text;
      logger.info("LocutorStreamer", "Server response", { text });
    });

    readStream.on("error", (err) => finish(err));

    readStream.on("end", () => {
      logger.info("LocutorStreamer", "File fully read, socket will close");
    });

    socket.on("close", () => {
      logger.info("LocutorStreamer", "Connection closed", {
        serverResponse: serverResponse.slice(0, 300) || "(empty)",
      });

      if (closed) return;
      closed = true;

      if (serverResponse.includes("200") || serverResponse.includes("OK2")) {
        resolve();
      } else if (serverResponse.includes("401") || serverResponse.includes("403")) {
        reject(new Error(`Authentication failed: ${serverResponse.slice(0, 200)}`));
      } else if (serverResponse.includes("404")) {
        reject(
          new Error(
            `Mount point "${MOUNT_POINT}" does not exist: ${serverResponse.slice(0, 200)}`
          )
        );
      } else {
        // Some Liquidsoap versions do not send any response; if the
        // connection closed cleanly after piping, assume it worked.
        resolve();
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      logger.error("LocutorStreamer", "Socket error", {
        error: err.message,
        code: err.code,
      });
      if (closed) return;
      closed = true;
      readStream.destroy();
      if (err.code === "ECONNREFUSED") {
        reject(
          new Error(
            `Connection refused to ${HARBOR_HOST}:${HARBOR_PORT}. Check LIQUIDSOAP_HARBOR_PORT`
          )
        );
      } else {
        reject(err);
      }
    });

    const timeout = setTimeout(() => {
      if (!closed) {
        logger.warn("LocutorStreamer", "Timeout while streaming", {
          timeoutMs,
          serverResponse: serverResponse.slice(0, 200) || "(empty)",
        });
        finish(new Error(`Timeout: stream did not finish within ${Math.round(timeoutMs / 1000)}s`));
      }
    }, timeoutMs);

    socket.on("close", () => clearTimeout(timeout));
  });
}

/**
 * Sends a file to the harbour. `durationMs` sizes the timeout: a notice longer
 * than the old fixed 30 s used to be cut in the middle.
 */
export async function playFileAsLive(filePath: string, durationMs = 0): Promise<void> {
  const creds = await getOrCreateAnnouncementStreamer();
  logger.info("LocutorStreamer", "Using streamer", {
    username: creds.username,
  });
  await streamMp3AsLive(creds.username, creds.password, filePath, durationMs);
}

/**
 * Estado del live con el nombre de quien lo ocupa.
 *
 * La distinción importa porque el aviso y un DJ humano usan el mismo mount: si
 * el sistema no puede decir quién está al aire, su única reacción segura sería
 * asumir, y asumir mal significa cortar a una persona.
 */
export interface LiveOwnership {
  active: boolean;
  humanStreamer: string | null;
}

export async function isOwnAnnouncementLive(): Promise<LiveOwnership> {
  try {
    const { data } = await azApi.get(`/nowplaying/${STATION_ID}`, { timeout: 8000 });
    const active = data?.live?.is_live === true;
    const raw = typeof data?.live?.streamer_name === "string" ? data.live.streamer_name.trim() : "";
    const name = raw === "" ? null : raw;

    if (!active || name === null) {
      return { active, humanStreamer: null };
    }

    const identities = await getAnnouncementStreamerIdentities();
    const isOwn = identities.has(normalizeStreamerName(name));

    return { active, humanStreamer: isOwn ? null : name };
  } catch (err) {
    logger.warn("LocutorStreamer", "Failed to read live ownership", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Ante la duda se considera que hay una persona al aire: cortar el stream
    // de un DJ es mucho peor que dejar un aviso sin finalizar.
    return { active: true, humanStreamer: "desconocido" };
  }
}
