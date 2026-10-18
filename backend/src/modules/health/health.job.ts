import cron from "node-cron";
import { runHealthCycle } from "./health.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

/**
 * Watchdog loop: runs every `health.checkIntervalMinutes` (default 2 min).
 * Checks AzuraCast, workers, jobs, disk, backups and listener sampling,
 * deduplicates alerts and attempts self-remediation.
 */
export function registerHealthJob(): void {
  // Read once, here: the expression below is frozen into the cron, which is
  // what makes this setting need a restart. The floor keeps a malformed value
  // from producing a cron expression the scheduler cannot parse.
  const minutes = Math.max(1, config.health.intervalMinutes);
  cron.schedule(
    `*/${minutes} * * * *`,
    () => {
      void runHealthCycle().catch((err) => {
        logger.error("HealthJob", "Cycle failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
    { timezone: config.locutor.timezone }
  );
  logger.info("HealthJob", "Health watchdog registered", { everyMinutes: minutes });
}
