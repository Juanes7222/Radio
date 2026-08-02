export const AZURACAST_REQUEST_TIMEOUT_MS = 15_000;
export const AZURACAST_UPLOAD_TIMEOUT_MS = 300_000;
export const AZURACAST_SHORT_TIMEOUT_MS = 10_000;

export const MAX_UPLOAD_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export const SONG_REQUESTS_CACHE_TTL_MS = 10 * 60 * 1000;
export const SONG_REQUESTS_PAGE_SIZE = 100;

export const SEARCH_MAX_PAGE_SIZE = 100;
export const SEARCH_DEFAULT_PAGE_SIZE = 25;

export const RECENT_FILES_LIMIT = 20;

export const PRAYER_PAGE_SIZE_DEFAULT = 20;
export const PRAYER_PAGE_SIZE_MAX = 50;

export const JOB_RETRY_MAX_BACKOFF_MS = 60 * 60 * 1000;
export const JOB_RETRY_BASE_DELAY_MS = 60_000;
export const JOB_STALE_ASSIGNED_THRESHOLD_MS = 30 * 60 * 1000;
export const JOB_PENDING_DISPATCH_BATCH_SIZE = 5;

export const WORKER_PING_INTERVAL_MS = 30_000;
export const WORKER_PRUNING_INTERVAL_MS = 30_000;

export const CHANNEL_SUBSCRIPTION_RENEW_INTERVAL_MS = 20 * 60 * 60 * 1000;

export const LIVE_SSE_HEARTBEAT_MS = 30_000;

export const TRAILING_SILENCE_SECONDS = 3;
export const LIVE_SWITCH_SETTLE_MS = 4000;
export const LIVE_SWITCH_CHECK_ATTEMPTS = 2;
export const RESCHEDULE_RETRY_MS = 15 * 60 * 1000;
export const SCHEDULING_GRACE_MINUTES = 5;
export const STREAM_RETRY_DELAY_MS = 1500;
export const STREAM_SOCKET_TIMEOUT_MS = 30_000;

export const GENERATED_AUDIO_EXPIRY_DAYS = 30;
export const NIGHTLY_PLAN_DAYS_AHEAD = 2;
export const NIGHTLY_SLOTS_PER_GROUP = 24;

export const DEFAULT_MEDIA_DIR = "/var/azuracast/stations/1/media/locutores";
export const DEFAULT_TEMP_DIR = "/tmp/yt-downloads";

export const UPLOAD_TMP_DIR_NAME = "lavoz-worker-uploads";

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/flac",
  "audio/wav",
  "audio/aac",
  "audio/x-flac",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "application/octet-stream",
];

export const AZURACAST_BASE_URL_TIMEOUTS = {
  nowPlaying: 5000,
  streamers: 5000,
  backend: 10_000,
};
