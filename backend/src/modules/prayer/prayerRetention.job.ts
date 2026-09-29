import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { purgeExpiredPrayerRequests } from "./prayerRetention.service";

/** Registers the daily purge of prayer requests past the retention window. */
export function registerPrayerRetentionJob(): void {
  const { retentionDays, purgeCron } = config.prayer;

  if (retentionDays <= 0) {
    logger.info("PrayerRetention", "Purge disabled (PRAYER_RETENTION_DAYS <= 0)");
    return;
  }

  cron.schedule(
    purgeCron,
    async () => {
      try {
        const removed = await purgeExpiredPrayerRequests(retentionDays);
        if (removed > 0) {
          logger.info("PrayerRetention", "Purged expired prayer requests", { removed });
        }
      } catch (err) {
        logger.error("PrayerRetention", "Purge failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
