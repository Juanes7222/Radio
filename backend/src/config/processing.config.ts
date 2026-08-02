import { envOr, intEnvOr } from "./env";

export const processingConfig = {
  maxDurationSeconds: intEnvOr("MAX_VIDEO_DURATION_SECONDS", 600),
  maxRetryAttempts: intEnvOr("MAX_RETRY_ATTEMPTS", 3),
  jobDeadlineHours: intEnvOr("JOB_DEADLINE_HOURS", 48),
  tempDir: envOr("TEMP_DOWNLOAD_DIR", "/tmp/yt-downloads"),
};
