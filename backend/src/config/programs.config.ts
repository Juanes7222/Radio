import os from "os";
import path from "path";
import { envOr, floatEnvOr, intEnvOr } from "./env";

/**
 * Folder layout of the program library inside the AzuraCast media storage and
 * the local assets the composer needs (intro, outro, artwork).
 */
export const programsConfig = {
  /** Root folder of the program library in AzuraCast. */
  rootFolder: envOr("PROGRAMS_ROOT_FOLDER", "PROGRAMAS"),
  /** Local folder holding the intro/outro assets, relative to the storage tree. */
  assetDir: envOr("PROGRAMS_ASSET_DIR", "program-assets"),
  /** Local folder holding the artwork, relative to the storage tree. */
  artDir: envOr("PROGRAMS_ART_DIR", "program-art"),
  /** Scratch directory used while composing an episode. */
  tempDir: envOr("PROGRAMS_TEMP_DIR", path.join(os.tmpdir(), "radio-programs")),
  /** Public prefix serving the artwork through the backend and through nginx. */
  artUrlPrefix: "/media/program-art",
  /** Minutes between the played-folder check runs. */
  syncIntervalMinutes: intEnvOr("PROGRAMS_SYNC_INTERVAL_MINUTES", 5),
  /** Cron that runs the played-folder check. */
  syncCron: envOr("PROGRAMS_SYNC_CRON", "*/5 * * * *"),
  /**
   * An episode must be out of the playlist this long before it counts as aired,
   * so a queue write that has not been reflected by AzuraCast yet is not
   * mistaken for a play.
   */
  playGraceMinutes: intEnvOr("PROGRAMS_PLAY_GRACE_MINUTES", 3),
  /** Ceiling for the composed episode duration, in minutes. */
  maxEpisodeMinutes: intEnvOr("PROGRAMS_MAX_EPISODE_MINUTES", 180),
  /** Integrated loudness target of a normalized episode, in LUFS. */
  loudnessTargetDb: floatEnvOr("PROGRAMS_LOUDNESS_TARGET", -16),
  /** True peak a normalized episode is never allowed to exceed, in dBFS. */
  loudnessCeilingDb: floatEnvOr("PROGRAMS_LOUDNESS_CEILING", -1.5),
  /** Upper bound of the applied gain, so a near-silent file is not blown up. */
  loudnessMaxGainDb: floatEnvOr("PROGRAMS_LOUDNESS_MAX_GAIN", 24),
  /** Hours a composed preview is kept before it is discarded unpublished. */
  draftTtlHours: intEnvOr("PROGRAMS_DRAFT_TTL_HOURS", 12),
};