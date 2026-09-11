import { spawn, type ChildProcess } from "child_process";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getMyAssignments, findStreamer } from "../djs/dj.service";
import type { AdminUserRecord } from "../auth/adminUsers.service";
import { effectivePermissions } from "../auth/permissions";

export interface RelayStart {
  streamerUsername: string;
  override?: boolean;
}

export interface RelayStatus {
  active: boolean;
  streamerUsername: string | null;
  adminEmail: string | null;
  startedAt: string | null;
  bytesReceived: number;
}

interface ActiveRelay {
  streamerUsername: string;
  adminUserId: string;
  adminEmail: string;
  override: boolean;
  proc: ChildProcess;
  startedAt: Date;
  bytesReceived: number;
  lastChunkAt: number;
  slotTimer: NodeJS.Timeout;
  stderrTail: string;
  detachedAt: number | null;
  graceTimer: NodeJS.Timeout | null;
}

let active: ActiveRelay | null = null;
let ffmpegChecked: boolean | null = null;

function checkFfmpeg(): Promise<boolean> {
  if (ffmpegChecked !== null) return Promise.resolve(ffmpegChecked);
  return new Promise((resolve) => {
    const probe = spawn(config.live.ffmpegPath, ["-version"]);
    probe.on("error", () => {
      ffmpegChecked = false;
      resolve(false);
    });
    probe.on("exit", (code) => {
      ffmpegChecked = code === 0;
      resolve(ffmpegChecked);
    });
    setTimeout(() => {
      if (ffmpegChecked === null) {
        ffmpegChecked = false;
        try {
          probe.kill();
        } catch {
          // ignore
        }
        resolve(false);
      }
    }, 5000);
  });
}

function resolveIcecastTarget(): { host: string; port: number; mount: string } {
  const fromEnv = config.live.icecastHost;
  let host = fromEnv;
  if (!host) {
    for (const candidate of [config.azuracast.publicUrl, config.azuracast.url]) {
      try {
        host = new URL(candidate).hostname;
        if (host) break;
      } catch {
        // try next candidate
      }
    }
  }
  if (!host) throw new Error("Sin host Icecast: define LIVE_ICECAST_HOST");
  const mount = config.live.icecastMount || `/${config.azuracast.stationId}`;
  return { host, port: config.live.icecastPort, mount };
}

function canOverride(user: AdminUserRecord): boolean {
  if (user.role === "SUPERADMIN") return true;
  if (user.role === "ADMIN") {
    return effectivePermissions(user.role, user.permissions).includes("streaming");
  }
  return false;
}

export function canStopAnyRelay(user: Pick<AdminUserRecord, "role" | "permissions">): boolean {
  return canOverride(user as AdminUserRecord);
}

function hasLiveAccess(user: AdminUserRecord): boolean {
  const perms = effectivePermissions(user.role, user.permissions);
  return perms.includes("live") || perms.includes("streaming");
}

export function getRelayStatus(): RelayStatus {
  if (!active) {
    return { active: false, streamerUsername: null, adminEmail: null, startedAt: null, bytesReceived: 0 };
  }
  return {
    active: true,
    streamerUsername: active.streamerUsername,
    adminEmail: active.adminEmail,
    startedAt: active.startedAt.toISOString(),
    bytesReceived: active.bytesReceived,
  };
}

export function isRelayActive(): boolean {
  return active !== null;
}

/**
 * Starts a live relay: browser audio -> ffmpeg -> Icecast as the DJ source.
 * Throws with a user-facing (Spanish) message when the start is denied.
 */
export async function startRelay(user: AdminUserRecord, input: RelayStart): Promise<RelayStatus> {
  if (!user.isActive) throw new Error("Cuenta desactivada");
  if (!hasLiveAccess(user)) throw new Error("No tienes permiso para transmitir en vivo");
  if (active) {
    // Reconexión del mismo DJ dentro de la ventana de gracia: reatacha.
    if (
      active.adminUserId === user.id &&
      active.streamerUsername.toLowerCase() === input.streamerUsername.trim().toLowerCase() &&
      active.detachedAt !== null
    ) {
      if (active.graceTimer) clearTimeout(active.graceTimer);
      active.graceTimer = null;
      active.detachedAt = null;
      logger.info("LiveRelay", "DJ reatachado tras reconexión", {
        streamer: active.streamerUsername,
      });
      return getRelayStatus();
    }
    if (active.adminUserId === user.id) throw new Error("Ya tienes una transmisión activa");
    throw new Error(`Otro DJ está en vivo (${active.streamerUsername})`);
  }

  const override = input.override === true && canOverride(user);
  if (input.override === true && !canOverride(user)) {
    throw new Error("Solo un admin puede transmitir fuera de franja");
  }

  const streamerUsername = input.streamerUsername.trim();
  if (!streamerUsername) throw new Error("DJ requerido");

  if (!override) {
    const mine = await getMyAssignments(user.id);
    const assignment = mine.rows.find(
      (r) => r.streamerUsername.toLowerCase() === streamerUsername.toLowerCase() && r.isActive
    );
    if (!assignment) throw new Error("Ese DJ no está asignado a tu cuenta");
    if (!assignment.inSlot) throw new Error("Fuera de tu franja asignada");
  }

  if (!(await checkFfmpeg())) {
    throw new Error("Transmisión no disponible en el servidor (ffmpeg ausente)");
  }

  const streamer = await findStreamer(streamerUsername);
  if (!streamer || !streamer.password) {
    throw new Error("No se pudo obtener la credencial del DJ en AzuraCast");
  }
  if (!streamer.isActive) throw new Error("Ese DJ está desactivado en AzuraCast");

  const target = resolveIcecastTarget();
  const sourceUrl = `icecast://${encodeURIComponent(streamer.username)}:${encodeURIComponent(
    streamer.password
  )}@${target.host}:${target.port}${target.mount}`;

  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    "pipe:0",
    "-vn",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "-f",
    "mp3",
    sourceUrl,
  ];
  const proc = spawn(config.live.ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });

  const relay: ActiveRelay = {
    streamerUsername: streamer.username,
    adminUserId: user.id,
    adminEmail: user.email,
    override,
    proc,
    startedAt: new Date(),
    bytesReceived: 0,
    lastChunkAt: Date.now(),
    slotTimer: setInterval(() => {
      void enforceSlot(relay);
    }, 30_000),
    stderrTail: "",
    detachedAt: null,
    graceTimer: null,
  };

  proc.stderr?.on("data", (chunk: Buffer) => {
    relay.stderrTail = `${relay.stderrTail}${chunk.toString()}`.slice(-2000);
  });
  proc.on("exit", (code) => {
    logger.warn("LiveRelay", "ffmpeg terminó", {
      code,
      streamer: relay.streamerUsername,
      tail: relay.stderrTail.slice(-500),
    });
    if (active === relay) {
      active = null;
      clearInterval(relay.slotTimer);
    }
  });
  proc.on("error", (err) => {
    logger.error("LiveRelay", "No se pudo iniciar ffmpeg", { error: err.message });
    if (active === relay) {
      active = null;
      clearInterval(relay.slotTimer);
    }
  });

  const maxMs = config.live.maxSessionMinutes * 60_000;
  setTimeout(() => {
    if (active === relay) {
      logger.info("LiveRelay", "Sesión detenida por duración máxima", {
        streamer: relay.streamerUsername,
      });
      stopRelay("Duración máxima alcanzada");
    }
  }, maxMs).unref?.();

  active = relay;
  logger.info("LiveRelay", "Transmisión iniciada", {
    streamer: relay.streamerUsername,
    admin: relay.adminEmail,
    override,
  });
  return getRelayStatus();
}

async function enforceSlot(relay: ActiveRelay): Promise<void> {
  if (relay.override || active !== relay) return;
  try {
    const mine = await getMyAssignments(relay.adminUserId);
    const assignment = mine.rows.find(
      (r) => r.streamerUsername.toLowerCase() === relay.streamerUsername.toLowerCase()
    );
    if (!assignment || !assignment.isActive || !assignment.inSlot) {
      logger.info("LiveRelay", "Franja terminada, deteniendo transmisión", {
        streamer: relay.streamerUsername,
      });
      stopRelay("Tu franja terminó");
    }
  } catch (err) {
    logger.error("LiveRelay", "Error verificando franja", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function pushAudio(chunk: Buffer): void {
  if (!active) return;
  if (!active.proc.stdin || active.proc.stdin.destroyed) return;
  active.bytesReceived += chunk.length;
  active.lastChunkAt = Date.now();
  const ok = active.proc.stdin.write(chunk);
  if (!ok) {
    active.proc.stdin.once("drain", () => undefined);
  }
}

/** Marks the caller's relay as detached: ffmpeg keeps running for the grace window. */
export function detachRelay(requesterId: string): void {
  if (!active || active.adminUserId !== requesterId || active.detachedAt !== null) return;
  active.detachedAt = Date.now();
  const graceMs = config.live.reconnectGraceSeconds * 1000;
  active.graceTimer = setTimeout(() => {
    if (active && active.detachedAt !== null) {
      logger.info("LiveRelay", "Ventana de reconexión agotada", {
        streamer: active.streamerUsername,
      });
      stopRelay("Desconexión prolongada");
    }
  }, graceMs);
  if (active.graceTimer.unref) active.graceTimer.unref();
}

/** Stops the active relay owned by this user (or any, for admins). */
export function stopRelay(reason = "Detenida", requesterId?: string): RelayStatus {
  if (!active) return getRelayStatus();
  if (requesterId && active.adminUserId !== requesterId) {
    throw new Error("Esa transmisión pertenece a otro usuario");
  }
  const relay = active;
  active = null;
  clearInterval(relay.slotTimer);
  if (relay.graceTimer) clearTimeout(relay.graceTimer);
  try {
    relay.proc.stdin?.end();
  } catch {
    // ignore
  }
  setTimeout(() => {
    try {
      if (!relay.proc.killed) relay.proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }, 3000).unref?.();
  logger.info("LiveRelay", "Transmisión detenida", {
    streamer: relay.streamerUsername,
    reason,
    bytes: relay.bytesReceived,
  });
  return getRelayStatus();
}
