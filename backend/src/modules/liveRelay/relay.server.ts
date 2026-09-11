import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getAdminUserById, type AdminUserRecord } from "../auth/adminUsers.service";
import { effectivePermissions } from "../auth/permissions";
import {
  detachRelay,
  getRelayStatus,
  pushAudio,
  startRelay,
  stopRelay,
} from "./relay.service";

const AUTH_TIMEOUT_MS = 10_000;
const MAX_CHUNK_BYTES = 256 * 1024;

const wss = new WebSocketServer({ noServer: true });

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

async function resolveUser(token: string): Promise<AdminUserRecord> {
  let decoded: { sub?: string; tv?: number };
  try {
    decoded = jwt.verify(token, config.jwt.secret) as { sub?: string; tv?: number };
  } catch {
    throw new Error("Token inválido o expirado");
  }
  if (!decoded.sub) throw new Error("Sesión anterior, vuelve a iniciar sesión");
  const user = await getAdminUserById(decoded.sub);
  if (!user || !user.isActive) throw new Error("Cuenta desactivada");
  if (decoded.tv !== undefined && decoded.tv !== user.tokenVersion) {
    throw new Error("Sesión revocada, vuelve a iniciar sesión");
  }
  const perms = effectivePermissions(user.role, user.permissions);
  if (!perms.includes("live") && !perms.includes("streaming")) {
    throw new Error("No tienes permiso para transmitir en vivo");
  }
  return user;
}

/**
 * Handles HTTP upgrade for GET /live-relay on the main HTTP server, so the
 * browser relay works on the same origin (and behind nginx) with no extra port.
 */
export function handleLiveUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
}

wss.on("connection", (socket: WebSocket) => {
  let user: AdminUserRecord | null = null;
  let authed = false;

  const authTimer = setTimeout(() => {
    if (!authed) {
      send(socket, { type: "error", message: "Autenticación requerida" });
      socket.close(1008, "auth required");
    }
  }, AUTH_TIMEOUT_MS);

  socket.on("message", (raw: Buffer | string, isBinary: boolean) => {
    if (isBinary) {
      if (!authed || !user) {
        socket.close(1008, "not authenticated");
        return;
      }
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as string);
      if (chunk.length > MAX_CHUNK_BYTES) return;
      try {
        pushAudio(chunk);
      } catch {
        send(socket, { type: "error", message: "No se pudo enviar audio" });
      }
      return;
    }

    let message: { type?: string; token?: string; streamerUsername?: string; override?: boolean };
    try {
      message = JSON.parse(raw.toString()) as typeof message;
    } catch {
      send(socket, { type: "error", message: "Mensaje inválido" });
      return;
    }

    if (message.type === "auth") {
      if (!message.token) {
        send(socket, { type: "error", message: "Falta el token" });
        return;
      }
      resolveUser(message.token)
        .then((u) => {
          user = u;
          authed = true;
          clearTimeout(authTimer);
          send(socket, { type: "authed", email: u.email, relay: getRelayStatus() });
        })
        .catch((err: unknown) => {
          send(socket, {
            type: "error",
            message: err instanceof Error ? err.message : "No autorizado",
          });
          socket.close(1008, "unauthorized");
        });
      return;
    }

    if (!authed || !user) {
      socket.close(1008, "not authenticated");
      return;
    }

    if (message.type === "start") {
      startRelay(user, {
        streamerUsername: message.streamerUsername ?? "",
        override: message.override,
      })
        .then((status) => {
          send(socket, { type: "live", relay: status });
        })
        .catch((err: unknown) => {
          const detail = err instanceof Error ? err.message : String(err);
          logger.warn("LiveRelayServer", "Inicio rechazado", {
            admin: user?.email,
            detail,
          });
          send(socket, { type: "error", message: detail });
        });
      return;
    }

    if (message.type === "stop") {
      try {
        const status = stopRelay("Detenida por el DJ", user.id);
        send(socket, { type: "stopped", relay: status });
      } catch (err: unknown) {
        send(socket, {
          type: "error",
          message: err instanceof Error ? err.message : "No se pudo detener",
        });
      }
      return;
    }

    if (message.type === "ping") {
      send(socket, { type: "pong", relay: getRelayStatus() });
      return;
    }
  });

  socket.on("close", () => {
    clearTimeout(authTimer);
    if (user) {
      // No se detiene de inmediato: el DJ tiene una ventana de gracia
      // para reconectar sin cortar la transmisión al aire.
      detachRelay(user.id);
      logger.info("LiveRelayServer", "DJ desconectado (ventana de gracia)", {
        admin: user.email,
      });
    }
  });

  socket.on("error", (err) => {
    logger.error("LiveRelayServer", "Socket error", { error: err.message });
  });
});
