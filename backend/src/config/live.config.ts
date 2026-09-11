import { envOr, intEnvOr } from "./env";

/**
 * Browser-to-Icecast live relay for assigned DJs.
 * The DJ streams mic audio from the panel; the backend pipes it through
 * ffmpeg acting as an Icecast source client with the DJ's own AzuraCast
 * streamer credentials (fetched server-side, never sent to the browser).
 */
export const liveConfig = {
  /** Icecast host. Empty = hostname of the AzuraCast public URL. */
  icecastHost: envOr("LIVE_ICECAST_HOST", "").trim(),
  icecastPort: intEnvOr("LIVE_ICECAST_PORT", 8000),
  /** Icecast mount. Empty = /<stationId>. */
  icecastMount: envOr("LIVE_ICECAST_MOUNT", "").trim(),
  /** Max live session length in minutes (safety cap). */
  maxSessionMinutes: intEnvOr("LIVE_MAX_SESSION_MINUTES", 240),
  /** Grace period in seconds to reconnect before the session is dropped. */
  reconnectGraceSeconds: intEnvOr("LIVE_RECONNECT_GRACE_SECONDS", 20),
  /** ffmpeg binary path. */
  ffmpegPath: envOr("FFMPEG_PATH", "ffmpeg").trim() || "ffmpeg",
};
