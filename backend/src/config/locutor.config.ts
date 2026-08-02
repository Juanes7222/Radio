import { floatEnvOr, intEnvOr, envOr } from "./env";

export const locutorConfig = {
  kokoroUrl: envOr("KOKORO_URL", "http://localhost:8880"),
  mediaDir: envOr(
    "MEDIA_DIR",
    "/var/azuracast/stations/1/media/locutores"
  ),
  timezone: envOr("TIMEZONE", "America/Bogota"),
  stationName: envOr("STATION_NAME", "Radio"),
  harborHost: envOr("LIQUIDSOAP_HARBOR_HOST", "localhost"),
  harborPort: intEnvOr("LIQUIDSOAP_HARBOR_PORT", 8005),
  mountPoint: envOr("LIQUIDSOAP_MOUNT_POINT", "/live"),
  streamerUser: envOr("LOCUTOR_STREAMER_USER", ""),
  streamerPassword: envOr("LOCUTOR_STREAMER_PASSWORD", ""),
  bedsDir: envOr("LOCUTOR_BEDS_DIR", "../packages/assets/audio"),
  bedVolume: floatEnvOr("LOCUTOR_BED_VOLUME", 0.15),
  announcementsPerHour: intEnvOr("LOCUTOR_ANNOUNCEMENTS_PER_HOUR", 2),
  minAnnouncementGapMinutes: intEnvOr("LOCUTOR_ANNOUNCEMENT_MIN_GAP_MINUTES", 20),
};
