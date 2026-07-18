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
    streamer_username: "avsisos_auto",
    streamer_password: password,
    display_name: "La Voz de la Verdad",
    comments: "Cuenta automatica para avisos de hora",
    is_active: true,
    enforce_schedule: false,
  });

  cachedCredentials = { username: "avsisos_auto", password };

  logger.info(
    "LocutorStreamer",
    `Streamer creado: avsisos_auto (ID ${data.id}). Password: ${password}`
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
      logger.info("LocutorStreamer", "Conectado a harbor, enviando headers");

      const headers = [
        `SOURCE ${MOUNT_POINT} HTTP/1.0`,
        `Content-Type: audio/mpeg`,
        `Authorization: Basic ${auth}`,
        `Content-Length: ${fileSize}`,
        `Ice-Public: 0`,
        `Ice-Name: Locutor Automatico`,
      ].join("\r\n");

      socket.write(headers + "\r\n\r\n");

      // Pipe the MP3 into the socket immediately after sending headers.
      // Liquidsoap's input.harbor starts consuming audio right away
      // once headers are parsed and auth passes.
      // If auth fails, the server closes the connection and we catch it
      // on the error/close events.
      readStream.pipe(socket, { end: true });
      logger.info("LocutorStreamer", "Transmitiendo MP3...", {
        sizeBytes: fileSize,
      });
    });

    socket.on("data", (data: Buffer) => {
      const text = data.toString("utf8").trim();
      serverResponse += text;
      logger.info("LocutorStreamer", "Respuesta del servidor", { text });
    });

    readStream.on("error", (err) => finish(err));

    readStream.on("end", () => {
      logger.info("LocutorStreamer", "Archivo leido completamente, socket se cerrara");
    });

    socket.on("close", () => {
      logger.info("LocutorStreamer", "Conexion cerrada", {
        serverResponse: serverResponse.slice(0, 300) || "(vacia)",
      });

      if (closed) return;
      closed = true;

      if (serverResponse.includes("200") || serverResponse.includes("OK2")) {
        resolve();
      } else if (serverResponse.includes("401") || serverResponse.includes("403")) {
        reject(new Error(`Autenticacion fallida: ${serverResponse.slice(0, 200)}`));
      } else if (serverResponse.includes("404")) {
        reject(
          new Error(
            `Mount point "${MOUNT_POINT}" no existe: ${serverResponse.slice(0, 200)}`
          )
        );
      } else {
        // Even without a positive server response, if we piped the data
        // and the connection closed cleanly, assume it worked.
        // Some Liquidsoap versions don't send any response.
        resolve();
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      logger.error("LocutorStreamer", "Error de socket", {
        error: err.message,
        code: err.code,
      });
      if (closed) return;
      closed = true;
      readStream.destroy();
      if (err.code === "ECONNREFUSED") {
        reject(
          new Error(
            `Conexion rechazada a ${HARBOR_HOST}:${HARBOR_PORT}. Verifica LIQUIDSOAP_HARBOR_PORT`
          )
        );
      } else {
        reject(err);
      }
    });

    const timeout = setTimeout(() => {
      if (!closed) {
        logger.warn("LocutorStreamer", "Timeout 30s", {
          serverResponse: serverResponse.slice(0, 200) || "(vacia)",
        });
        finish(new Error("Timeout: servidor no respondio en 30s"));
      }
    }, 30_000);

    socket.on("close", () => clearTimeout(timeout));
  });
}

export async function playFileAsLive(filePath: string): Promise<void> {
  const creds = await getOrCreateAnnouncementStreamer();
  logger.info("LocutorStreamer", "Usando streamer", {
    username: creds.username,
  });
  await streamMp3AsLive(creds.username, creds.password, filePath);
}
