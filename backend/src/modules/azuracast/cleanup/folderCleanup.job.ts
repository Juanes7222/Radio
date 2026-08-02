import cron from "node-cron";
import { cleanupNewsFolder } from "./folderCleanup.service";
import { config } from "../../../config";
import { logger } from "../../../shared/logger/logger";

const CLEANUP_SCHEDULES = [
  { time: "0 7 * * *", label: "07:00 AM" },
  { time: "0 13 * * *", label: "01:00 PM" },
  { time: "0 19 * * *", label: "07:00 PM" },
];

/**
 * Registers cron jobs to clean up the designated news folder based on predefined schedules.
 */
export function registerFolderCleanupJob(): void {
  for (const schedule of CLEANUP_SCHEDULES) {
    cron.schedule(
      schedule.time,
      async () => {
        logger.info("FolderCleanupJob", `Starting scheduled cleanup at ${schedule.label}`);
        try {
          await cleanupNewsFolder();
          logger.info("FolderCleanupJob", `Scheduled cleanup completed at ${schedule.label}`);
        } catch (err) {
          logger.error("FolderCleanupJob", `Scheduled cleanup failed at ${schedule.label}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
      { timezone: config.locutor.timezone }
    );

    logger.info("FolderCleanupJob", `Registered cleanup job at ${schedule.label}`);
  }
}
