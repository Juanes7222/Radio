import net from "net";
import { spawn, type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { getSettings, updateSettings } from "./settings.service";

const STREAMER_USERNAME = "avsisos_auto";
const CONNECT_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 8_000;

let playing = false;

interface StreamerCredentials {
  username: string;
  password: string;
}

async function getOrCreateAnnouncementStreamer(): Promise<StreamerCredentials> {
  const settings = await getSettings();
  const username = settings.streamerUser || config.locutor.streamerUser;
  const password = settings.streamerPassword || config.locutor.streamerPassword;

  if (username && password) return { username, password };
  if (username || password) {
    throw new Error("Completa el usuario y la contraseña del locutor en el panel o en el entorno");
  }

  const endpoint = `/station/${STATION_ID}/streamers`;
  const options = { timeout: REQUEST_TIMEOUT_MS };
  const { data: streamers } = await azuracastApi.get<Array<{ streamer_username: string }>>(endpoint, options);

  if (streamers.some((streamer) => streamer.streamer_username === STREAMER_USERNAME)) {
    throw new Error(
      `El usuario ${STREAMER_USERNAME} ya existe en AzuraCast. Configura su contraseña en Locutor o en LOCUTOR_STREAMER_PASSWORD junto con LOCUTOR_STREAMER_USER.`
    );
  }

  const generatedPassword = randomBytes(24).toString("hex");
  await azuracastApi.post(endpoint, {
    streamer_username: STREAMER_USERNAME,
    streamer_password: generatedPassword,
    display_name: "Locutor automático",
    comments: "Automatic account for time announcements",
    is_active: true,
    enforce_schedule: false,
  }, options);

  await updateSettings({ streamerUser: STREAMER_USERNAME, streamerPassword: generatedPassword });
  return { username: STREAMER_USERNAME, password: generatedPassword };
}

function streamMp3AsLive(
  credentials: StreamerCredentials,
  filePath: string,
  durationMs: number
): Promise<void> {
  const { harborHost, harborPort, mountPoint } = config.locutor;
  const authorization = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: harborHost, port: harborPort, allowHalfOpen: true });
    let encoder: ChildProcess | undefined;
    let received = "";
    let finished = false;
    let streamTimeout: NodeJS.Timeout | undefined;
    const connectTimeout = setTimeout(
      () => finish(new Error(`Liquidsoap no aceptó la conexión en ${harborHost}:${harborPort}${mountPoint}`)),
      CONNECT_TIMEOUT_MS
    );

    function finish(error?: Error): void {
      if (finished) return;
      finished = true;
      clearTimeout(connectTimeout);
      clearTimeout(streamTimeout);
      socket.destroy();
      if (encoder && encoder.exitCode === null) encoder.kill();
      if (error) reject(error);
      else resolve();
    }

    socket.once("connect", () => {
      socket.write([
        `SOURCE ${mountPoint} HTTP/1.0`,
        "Content-Type: audio/mpeg",
        `Authorization: Basic ${authorization}`,
        "Ice-Public: 0",
        "Ice-Name: Locutor automatico",
        "",
        "",
      ].join("\r\n"));
    });

    socket.on("data", (chunk: Buffer) => {
      if (encoder) return;
      received += chunk.toString("utf8");
      const lineEnd = received.indexOf("\n");
      if (lineEnd === -1) {
        if (received.length > 4096) finish(new Error("Respuesta inválida de Liquidsoap"));
        return;
      }

      const status = received.slice(0, lineEnd).trim();
      if (!/^HTTP\/\d\.\d 200(?:\s|$)/.test(status) && status !== "OK2") {
        finish(new Error(`Liquidsoap rechazó la fuente en ${mountPoint}: ${status.slice(0, 100)}`));
        return;
      }

      clearTimeout(connectTimeout);
      streamTimeout = setTimeout(
        () => finish(new Error("Liquidsoap no recibió el audio completo a tiempo")),
        durationMs + CONNECT_TIMEOUT_MS
      );
      logger.info("LocutorStreamer", "Harbor accepted the announcement source", { mountPoint });

      const ffmpeg = spawn("ffmpeg", [
        "-nostdin", "-v", "error", "-re", "-i", filePath,
        "-map", "0:a:0", "-c:a", "copy", "-write_xing", "0", "-f", "mp3", "pipe:1",
      ], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      encoder = ffmpeg;

      ffmpeg.stdout.pipe(socket, { end: false });
      ffmpeg.stdout.once("error", finish);
      ffmpeg.once("error", finish);
      ffmpeg.once("close", (code) => {
        if (finished) return;
        if (code !== 0) {
          finish(new Error(`FFmpeg no pudo transmitir el aviso (código ${code ?? "desconocido"})`));
          return;
        }
        socket.end(() => finish());
      });
    });

    socket.once("end", () => finish(new Error("Liquidsoap cerró la conexión antes de terminar el aviso")));
    socket.once("close", () => finish(new Error("Se cerró la conexión con Liquidsoap antes de terminar el aviso")));
    socket.once("error", (error) => {
      finish(new Error(`Conexión con Liquidsoap en ${harborHost}:${harborPort}${mountPoint}: ${error.message}`));
    });
  });
}

export async function playFileAsLive(
  filePath: string,
  durationMs: number,
  beforeConnect: () => Promise<void>
): Promise<void> {
  if (playing) throw new Error("Ya hay un aviso en curso");
  playing = true;
  try {
    const credentials = await getOrCreateAnnouncementStreamer();
    await beforeConnect();
    await streamMp3AsLive(credentials, filePath, durationMs);
  } finally {
    playing = false;
  }
}
