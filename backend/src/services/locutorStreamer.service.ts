import net from "net";
import fs from "fs";
import axios from "axios";
import { config } from "../config";
import { logger } from "../utils/logger";

const STATION = config.azuracast.stationId;

const azApi = axios.create({
  baseURL: `${config.azuracast.url}/api`,
  headers: { "X-API-Key": config.azuracast.apiKey },
});

const HARBOR_HOST = config.locutor.harborHost;
const HARBOR_PORT = config.locutor.harborPort;
const MOUNT_POINT = config.locutor.mountPoint;

let cachedCredentials: { username: string; password: string } | null = null;

function generatePassword(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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

  const { data: streamers } = await azApi.get(
    `/station/${STATION}/streamers`
  );
  const existing = streamers.find(
    (s: any) => s.streamer_username === "locutor_auto"
  );

  if (existing) {
    throw new Error(
      'Streamer "locutor_auto" ya existe pero no hay password configurado. ' +
        "Define LOCUTOR_STREAMER_USER y LOCUTOR_STREAMER_PASSWORD en .env"
    );
  }

  const password = generatePassword();
  const { data } = await azApi.post(`/station/${STATION}/streamers`, {
    streamer_username: "locutor_auto",
    streamer_password: password,
    display_name: "Locutor Automatico",
    comments: "Cuenta automatica para avisos de hora",
    is_active: true,
    enforce_schedule: false,
  });

  cachedCredentials = { username: "locutor_auto", password };

  logger.info(
    "LocutorStreamer",
    `Streamer creado: locutor_auto (ID ${data.id}). Guarda esta password en .env: ${password}`
  );

  return cachedCredentials;
}

export function streamMp3AsLive(
  username: string,
  password: string,
  filePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const fileSize = fs.statSync(filePath).size;
    const readStream = fs.createReadStream(filePath);
    const auth = Buffer.from(`${username}:${password}`).toString("base64");

    const socket = new net.Socket();
    let headerResponse = "";
    let headersDone = false;
    let streamed = false;

    const teardown = (err?: Error) => {
      socket.destroy();
      readStream.destroy();
      if (err) reject(err);
    };

    socket.connect(HARBOR_PORT, HARBOR_HOST, () => {
      const headers = [
        `SOURCE ${MOUNT_POINT} ICE/1.0`,
        `Content-Type: audio/mpeg`,
        `Authorization: Basic ${auth}`,
        `Content-Length: ${fileSize}`,
        `Ice-Public: 0`,
        `Ice-Name: Locutor Automatico`,
        "",
        "",
      ].join("\r\n");

      socket.write(headers);
    });

    socket.on("data", (data: Buffer) => {
      if (!headersDone) {
        headerResponse += data.toString("utf8");
        if (
          headerResponse.includes("200 OK") ||
          headerResponse.includes("OK2")
        ) {
          headersDone = true;
          streamed = true;
          readStream.pipe(socket);
        } else if (
          headerResponse.includes("401") ||
          headerResponse.includes("403")
        ) {
          teardown(new Error("Autenticacion fallida en Icecast source"));
        }
      }
    });

    readStream.on("error", (err) => teardown(err));

    socket.on("close", () => {
      logger.info("LocutorStreamer", "Conexion Icecast cerrada");
      if (!streamed) {
        return reject(new Error("Conexion cerrada sin poder transmitir"));
      }
      resolve();
    });

    socket.on("error", (err) => {
      readStream.destroy();
      reject(err);
    });

    const timeout = setTimeout(() => {
      logger.warn("LocutorStreamer", "Timeout de conexion, forzando cierre");
      teardown(new Error("Timeout de conexion a harbor (30s)"));
    }, 30_000);

    socket.on("close", () => clearTimeout(timeout));
  });
}

export async function playFileAsLive(filePath: string): Promise<void> {
  const creds = await getOrCreateAnnouncementStreamer();
  await streamMp3AsLive(creds.username, creds.password, filePath);
}
