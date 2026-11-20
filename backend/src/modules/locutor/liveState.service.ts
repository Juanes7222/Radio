import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";

const REQUEST_TIMEOUT_MS = 8_000;

interface AzuraPlaylist {
  name?: string;
  is_enabled?: boolean;
  schedule_items?: unknown[] | null;
}

interface AzuraNowPlayingResponse {
  live?: { is_live?: boolean; streamer_name?: string | null } | null;
  now_playing?: { playlist?: string | null } | null;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function fetchScheduledPlaylistNames(): Promise<Set<string>> {
  const { data } = await azuracastApi.get<AzuraPlaylist[]>(
    `/station/${STATION_ID}/playlists`,
    { timeout: REQUEST_TIMEOUT_MS }
  );

  if (!Array.isArray(data)) throw new Error("Unexpected station playlists response");
  return new Set(data
    .filter((playlist) => playlist.is_enabled !== false && playlist.schedule_items?.length)
    .flatMap(({ name }) => typeof name === "string" && name.trim() ? [normalize(name)] : []));
}

export interface LiveCheckOptions {
  respectLiveStreamer: boolean;
  respectScheduledPrograms: boolean;
}

export interface LiveVerdict {
  allowed: boolean;
  reason: "ok" | "live_streamer" | "scheduled_program" | "unknown";
  detail: string;
  liveStreamer: string | null;
  playingPlaylist: string | null;
  degraded: boolean;
}

export async function evaluateLiveState(options: LiveCheckOptions): Promise<LiveVerdict> {
  let playingPlaylist: string | null = null;
  try {
    const scheduled = options.respectScheduledPrograms ? await fetchScheduledPlaylistNames() : null;
    const { data } = await azuracastApi.get<AzuraNowPlayingResponse>(`/nowplaying/${STATION_ID}`, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    playingPlaylist = typeof data.now_playing?.playlist === "string" ? data.now_playing.playlist : null;
    const isLive = data.live?.is_live;
    if (typeof isLive !== "boolean") throw new Error("Unexpected station live state");
    const liveStreamer = isLive ? data.live?.streamer_name?.trim() || null : null;

    if (options.respectLiveStreamer && isLive) {
      return {
        allowed: false,
        reason: "live_streamer",
        detail: liveStreamer ? `Hay una fuente en vivo: ${liveStreamer}` : "La estación tiene una fuente en vivo sin identificar",
        liveStreamer,
        playingPlaylist,
        degraded: false,
      };
    }

    if (playingPlaylist && scheduled?.has(normalize(playingPlaylist))) {
      return {
        allowed: false,
        reason: "scheduled_program",
        detail: `Hay un programa en curso: ${playingPlaylist}`,
        liveStreamer,
        playingPlaylist,
        degraded: false,
      };
    }

    return {
      allowed: true,
      reason: "ok",
      detail: "Ventana disponible para un aviso",
      liveStreamer,
      playingPlaylist,
      degraded: false,
    };
  } catch {
    return {
      allowed: false,
      reason: "unknown",
      detail: "No se pudo confirmar el estado o la programación de la estación",
      liveStreamer: null,
      playingPlaylist,
      degraded: true,
    };
  }
}
