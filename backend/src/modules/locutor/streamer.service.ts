import net from "net";
import fs from "fs";
import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { STATION_ID } from "../azuracast/azuracast.client";

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
});

const HARBOR_HOST = config.locutor.harborHost;
const HARBOR_PORT = config.locutor.harborPort;
const MOUNT_POINT = config.locutor.mountPoint;
const STREAMER_USERNAME = "avsisos_auto";
const STREAM_TIMEOUT_MS = 30_000;

let cachedCredentials: { username: string; password: string } | null = null;

function generatePassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface StreamerDto {
  id: number;
  streamer_username: string;
}

export async function getOrCreateAnnouncementStreamer(): Promise<{
  username: string;
  password: string;
}> {
  if (cachedCredentials) return cachedCredentials;

  if (config.locutor.streamerUser && config.locutor.streamerPassword) {
    cachedCredentials = {
      username: config.locutor.streamerUser,
      password: config.locutor.streamerPassword,
    };
    return cachedCredentials;
  }

  const { data: streamers } = await azApi.get<StreamerDto[]>(`/station/${STATION_ID}/streamers`);
  const existing = streamers.find((s) => s.streamer_username === STREAMER_USERNAME);

  if (existing) {
    throw new Error(
      'Streamer "avsisos_auto" already exists but no password is configured. ' +
        "Define LOCUTOR_STREAMER_USER and LOCUTOR_STREAMER_PASSWORD in .env"
    );
  }

  const password = generatePassword();
  const { data } = await azApi.post<StreamerDto>(`/station/${STATION_ID}/streamers`, {
    streamer_username: STREAMER_USERNAME,
    streamer_password: password,
    display_name: config.locutor.stationName,
    comments: "Automatic account for hourly announcements",
    is_active: true,
    enforce_schedule: false,
  });

  cachedCredentials = { username: STREAMER_USERNAME, password };

  logger.info(
    "LocutorStreamer",
    `Streamer created: ${STREAMER_USERNAME} (ID ${data.id})`
  );

  return cachedCredentials;
}

function streamMp3AsLive(username: string, password: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const fileSize = fs.statSync(filePath).size;
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
      logger.info("LocutorStreamer", "Streaming MP3...", { sizeBytes: fileSize });
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
        logger.warn("LocutorStreamer", "Timeout 30s", {
          serverResponse: serverResponse.slice(0, 200) || "(empty)",
        });
        finish(new Error("Timeout: server did not respond within 30s"));
      }
    }, STREAM_TIMEOUT_MS);

    socket.on("close", () => clearTimeout(timeout));
  });
}

export async function playFileAsLive(filePath: string): Promise<void> {
  const creds = await getOrCreateAnnouncementStreamer();
  logger.info("LocutorStreamer", "Using streamer", {
    username: creds.username,
  });
  await streamMp3AsLive(creds.username, creds.password, filePath);
}
