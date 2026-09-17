import cron from "node-cron";
import { runHealthCycle } from "./health.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

/**
 * Watchdog loop: runs every HEALTH_CHECK_INTERVAL_SECONDS (default 2 min).
 * Checks AzuraCast, workers, jobs, disk, backups and listener sampling,
 * deduplicates alerts and attempts self-remediation.
 */
export function registerHealthJob(): void {
  const seconds = Math.max(30, config.health.intervalSeconds);
  const minutes = Math.ceil(seconds / 60);
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
