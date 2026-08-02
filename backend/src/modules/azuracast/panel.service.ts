import { azuracastApi, STATION_ID } from "./azuracast.client";
import { AZURACAST_BASE_URL_TIMEOUTS } from "../../shared/constants";

export interface PanelStatus {
  isLive: boolean;
  streamerName: string | null;
  currentSong: string | null;
  currentArtist: string | null;
  listeners: number;
  autoDjEnabled: boolean;
}

export async function getPanelStatus(): Promise<PanelStatus> {
  const [nowPlayingRes, streamerRes] = await Promise.all([
    azuracastApi.get(`/nowplaying/${STATION_ID}`, { timeout: AZURACAST_BASE_URL_TIMEOUTS.nowPlaying }),
    azuracastApi.get(`/station/${STATION_ID}/streamers`, { timeout: AZURACAST_BASE_URL_TIMEOUTS.streamers }),
  ]);

  const np = nowPlayingRes.data;

  return {
    isLive: np.live?.is_live ?? false,
    streamerName: np.live?.streamer_name ?? null,
    currentSong: np.now_playing?.song?.title ?? null,
    currentArtist: np.now_playing?.song?.artist ?? null,
    listeners: np.listeners?.current ?? 0,
    autoDjEnabled: np.station?.backend_type !== "none",
  };
}

export async function stopAutoDj(): Promise<void> {
  await azuracastApi.post(`/station/${STATION_ID}/backend/stop-autodj`, {}, { timeout: AZURACAST_BASE_URL_TIMEOUTS.backend });
}

export async function startAutoDj(): Promise<void> {
  await azuracastApi.post(`/station/${STATION_ID}/backend/start-autodj`, {}, { timeout: AZURACAST_BASE_URL_TIMEOUTS.backend });
}
