export const PROGRAM_PERMISSION = "programs";

export const PROGRAM_AUDIO_MIME_TYPES = [
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
] as const;

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const ALLOWED_IMAGE_MIME_SET: ReadonlySet<string> = new Set(ALLOWED_IMAGE_MIMES);

export const PROGRAM_ART_MAX_BYTES = 8 * 1024 * 1024;
export const PROGRAM_ASSET_MAX_BYTES = 80 * 1024 * 1024;
export const PROGRAM_EPISODE_MAX_BYTES = 400 * 1024 * 1024;

export const EPISODE_STATUSES = ["draft", "processing", "queued", "played", "failed"] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export const SCHEDULE_MODES = ["none", "auto", "manual"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export const DEFAULT_PENDING_FOLDER = "NO REPRODUCIDOS";
export const DEFAULT_PLAYED_FOLDER = "REPRODUCIDOS";

export const ALL_DAYS_MASK = 0b1111111;

export const SLOT_STEP_MINUTES = 5;

export const DEFAULT_FALLBACK_TITLE = "Episodio";

/** File name of the composed episode inside the scratch directory. */
export const COMPOSED_EPISODE_FILE = "episode.mp3";