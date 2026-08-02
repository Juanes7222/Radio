import { envOr, normalizeHttpUrl, requiredEnv } from "./env";

export const azuracastConfig = {
  url: normalizeHttpUrl(requiredEnv("AZURACAST_URL")),
  apiKey: requiredEnv("AZURACAST_API_KEY"),
  stationId: requiredEnv("AZURACAST_STATION_ID"),
  playlistId: envOr("AZURACAST_PLAYLIST_ID", ""),
  newsPlaylistId: envOr("AZURACAST_NEWS_PLAYLIST_ID", ""),
  newsFolderPath: envOr(
    "AZURACAST_NEWS_FOLDER_PATH",
    "/var/azuracast/stations/1/media/NOTICIAS"
  ),
  publicUrl: normalizeHttpUrl(
    envOr("AZURACAST_PUBLIC_URL", process.env.AZURACAST_URL ?? "")
  ),
};
