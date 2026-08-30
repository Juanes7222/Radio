import cron from "node-cron";
import { logger } from "../../../shared/logger/logger";
import { cleanupOrphanNoticeMedia } from "./media.cleanup";

/**
 * Registers a daily job to clean up orphan notice media.
 * Runs at 04:15 AM server time.
 */
export function registerNoticeMediaCleanupJob(): void {
  cron.schedule("15 4 * * *", async () => {
    logger.info("NoticeMediaCleanup", "Running scheduled cleanup");
    await cleanupOrphanNoticeMedia();
  });
}
