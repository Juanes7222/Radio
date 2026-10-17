import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { reconcileAllBumpers } from "./bumper.service";

/**
 * Re-pins the intro and the outro of every enabled bumper. It has to run on a
 * timer rather than once: the Bible rotation empties and rebuilds its playlist at
 * 03:30, and a sequential playlist can drop an item once it has played, so a
 * one-shot reconciliation would silently lose the bumpers before the next show.
 */
export function registerBumperJob(): void {
  cron.schedule(
    config.bumpers.syncCron,
    () => {
      reconcileAllBumpers()
        .then((results) => {
          const withWarnings = results.filter((result) => result.warnings.length > 0);
          if (withWarnings.length > 0) {
            logger.info("BumperJob", "Bumpers reconciled with warnings", {
              total: results.length,
              withWarnings: withWarnings.length,
            });
          }
        })
        .catch((err) => {
          logger.error("BumperJob", "Bumper reconciliation failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    { timezone: config.locutor.timezone }
  );
}