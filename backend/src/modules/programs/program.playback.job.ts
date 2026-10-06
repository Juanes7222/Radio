import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { discardStaleDrafts, syncAllPrograms } from "./program.episode.service";

/**
 * Moves the episodes that already aired from the pending folder to the played
 * folder. A sequential playlist drops an item once it is played, so the
 * playlist membership is what tells an aired episode apart from a queued one.
 *
 * The same sweep drops previews nobody published, so an abandoned composition
 * does not keep a full-size MP3 on disk forever.
 */
export function registerProgramSyncJob(): void {
  cron.schedule(
    config.programs.syncCron,
    () => {
      syncAllPrograms()
        .then((results) => {
          const archived = results.reduce((total, result) => total + result.archived, 0);
          const errors = results.reduce((total, result) => total + result.errors.length, 0);
          if (archived > 0 || errors > 0) {
            logger.info("ProgramSyncJob", "Programs synced", { programs: results.length, archived, errors });
          }
        })
        .catch((err: unknown) => {
          logger.error("ProgramSyncJob", "Program sync failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          discardStaleDrafts().catch((err: unknown) => {
            logger.error("ProgramSyncJob", "Draft sweep failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        });
    },
    { timezone: config.locutor.timezone }
  );
}