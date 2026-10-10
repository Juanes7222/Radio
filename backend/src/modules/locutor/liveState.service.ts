import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { getStationTime } from "../../shared/utils/date";

/**
 * Estado real de la estación en el momento de decidir un aviso.
 *
 * Este servicio es la respuesta directa a los programas que no cumplen el
 * horario. La programación dice qué debería estar sonando; este servicio dice
 * qué está sonando. Cuando una predica termina antes de las 16:00, la
 * programación sigue diciendo 16:00 y este servicio ya no: ahí está la
 * diferencia entre perder el aviso y emitirlo.
 */

const REQUEST_TIMEOUT_MS = 8_000;

/** Nombre del streamer propio de los avisos. */
const ANNOUNCEMENT_STREAMER = "avsisos_auto";

interface AzuraNowPlayingPlaylist {
  id?: number;
  name?: string;
  schedule_items?: Array<{ start_time: number; end_time: number; days: number[] }> | null;
}

interface AzuraNowPlayingResponse {
  live?: { is_live?: boolean; streamer_name?: string | null } | null;
  now_playing?: { playlist?: string | null; streamer?: string | null } | null;
}

export interface LiveState {
  checkedAt: Date;
  /** Instante en que se consultó, para medir la antigüedad de la respuesta. */
  stationTime: { hour: number; minute: number };
  /** Hay una persona transmitiendo en vivo. */
  liveStreamer: string | null;
  /** Playlist que está sonando realmente, o null si la estación está muda. */
  playingPlaylist: string | null;
  /** La playlist que suena tiene horario asignado: es un programa. */
  playingIsScheduled: boolean;
  /** El streamer en vivo es el propio sistema de anuncios. */
  liveIsOwnAnnouncement: boolean;
  /** No se pudo leer el estado; hay que tratarlo como "no se sabe". */
  degraded: boolean;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u030f]/g, "")
    .trim();
}

function sameName(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = normalize(a);
  const right = normalize(b);
  return left === right;
}

/**
 * AzuraCast returns `streamer_name: ""` when the live port is taken but no DJ is
 * authenticated, so a bare `typeof === "string"` check reads "nobody identified"
 * as "someone is on air" and blocks every notice with a blank name. Blocking has
 * to depend on an identifiable streamer, not on live being switched on.
 */
function readStreamerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Índice de nombres de playlist que tienen horario asignado. Cualquier
 * playlist en este índice es un programa y bloquea los avisos mientras suena.
 *
 * Se deduce de la programación de la propia estación, así que agregar un
 * programa nuevo queda protegido sin tocar configuración. La comparación
 * normaliza acentos y mayúsculas porque AzuraCast y la programación pueden no
 * coincidir exactamente.
 */
export async function fetchScheduledPlaylistNames(): Promise<Set<string>> {
  const { data } = await azuracastApi.get<AzuraNowPlayingPlaylist[]>(
    `/station/${STATION_ID}/playlists`,
    { timeout: REQUEST_TIMEOUT_MS }
  );

  const names = new Set<string>();
  for (const playlist of Array.isArray(data) ? data : []) {
    if (!Array.isArray(playlist.schedule_items) || playlist.schedule_items.length === 0) continue;
    if (typeof playlist.name !== "string" || playlist.name.trim().length === 0) continue;
    names.add(normalize(playlist.name));
  }
  return names;
}

export interface LiveCheckOptions {
  respectLiveStreamer: boolean;
  respectScheduledPrograms: boolean;
}

/**
 * Veredicto sobre si se puede emitir un aviso ahora mismo.
 *
 * El orden importa: primero se descarta por humano en vivo, que es la
 * condición que nunca se negocia, y después por programa en curso. La
 * asimetría es deliberada. Si un humano se conecta a mitad de un aviso ya
 * emitido, el aviso se detiene; si un programa se alarga, simplemente no se
 * emite. Perder un aviso es aceptable, cortar a una persona no.
 */
export interface LiveVerdict {
  allowed: boolean;
  reason: "ok" | "live_streamer" | "scheduled_program" | "unknown";
  detail: string;
  liveStreamer: string | null;
  playingPlaylist: string | null;
  /** true cuando no se pudo consultar AzuraCast. */
  degraded: boolean;
}

/**
 * Consulta el estado en vivo y decide. Ante un fallo de red devuelve
 * `unknown` con `allowed: false`: no emitir es la posición segura, porque emitir
 * a ciegas puede cortar a un DJ.
 */
export async function evaluateLiveState(
  options: LiveCheckOptions
): Promise<LiveVerdict & { state: LiveState | null }> {
  const stationTime = getStationTime();

  let response: AzuraNowPlayingResponse;
  try {
    const { data } = await azuracastApi.get(`/nowplaying/${STATION_ID}`, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    response = data as AzuraNowPlayingResponse;
  } catch {
    return {
      allowed: false,
      reason: "unknown",
      detail: "No se pudo consultar el estado de la estación",
      liveStreamer: null,
      playingPlaylist: null,
      degraded: true,
      state: null,
    };
  }

  const streamerName = readStreamerName(response.live?.streamer_name);
  const isLive = response.live?.is_live === true;
  const liveStreamer = isLive ? streamerName : null;
  const liveIsOwnAnnouncement = liveStreamer !== null && sameName(liveStreamer, ANNOUNCEMENT_STREAMER);
  const playingPlaylist =
    typeof response.now_playing?.playlist === "string" ? response.now_playing.playlist : null;

  let playingIsScheduled = false;
  try {
    const scheduled = await fetchScheduledPlaylistNames();
    playingIsScheduled = scheduled.has(normalize(playingPlaylist ?? ""));
  } catch {
    // Si no se pudo leer la programación se asume que lo que suena está
    // programado, que es la posición conservadora.
    playingIsScheduled = true;
  }

  const state: LiveState = {
    checkedAt: new Date(),
    stationTime: { hour: stationTime.hour, minute: stationTime.minute },
    liveStreamer,
    playingPlaylist,
    playingIsScheduled,
    liveIsOwnAnnouncement,
    degraded: false,
  };

  if (options.respectLiveStreamer && liveStreamer !== null && !liveIsOwnAnnouncement) {
    return {
      allowed: false,
      reason: "live_streamer",
      detail: `Hay una persona transmitiendo en vivo: ${liveStreamer}`,
      liveStreamer,
      playingPlaylist,
      degraded: false,
      state,
    };
  }

  if (options.respectScheduledPrograms && playingIsScheduled) {
    return {
      allowed: false,
      reason: "scheduled_program",
      detail: playingPlaylist
        ? `Hay un programa en curso: ${playingPlaylist}`
        : "Hay un programa en curso",
      liveStreamer,
      playingPlaylist,
      degraded: false,
      state,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    detail: "No hay persona en vivo ni programa en curso",
    liveStreamer,
    playingPlaylist,
    degraded: false,
    state,
  };
}

export { ANNOUNCEMENT_STREAMER };
