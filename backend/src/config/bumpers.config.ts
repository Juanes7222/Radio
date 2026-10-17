import { envOr } from "./env";

/**
 * Intro/outro of the special programs: the local copies of the bumper files and
 * how often the target playlist is re-pinned. The cron has to be periodic because
 * the Bible rotation empties and rebuilds its playlist every night, and because
 * AzuraCast may drop a played item from a sequential playlist.
 */
export const bumpersConfig = {
  /** Local folder holding the copies of the intro/outro, relative to the storage tree. */
  assetDir: envOr("BUMPERS_ASSET_DIR", "program-bumpers"),
  /** Cron expression of the reconciliation job. */
  syncCron: envOr("BUMPERS_SYNC_CRON", "*/5 * * * *"),
};