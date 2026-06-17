import cron from "node-cron";
import { playScheduledAnnouncementForHour } from "../services/playbackAzuracast.service";
import { config } from "../config";
import { logger } from "../utils/logger";

/**
 * Computes a random minute offset between 0 and 50 for the current hour
 * to avoid the announcement always playing at the exact same time.
 * Stored in a file so it persists across cron job restarts but rotates
 * each day.
 */
function getTodayOffset(): number {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return dayOfYear % 51;
}

export function registerPlaybackJob() {
  const minuteOffset = getTodayOffset();
  const cronExpr = `${minuteOffset} * * * *`;

  cron.schedule(
    cronExpr,
    async () => {
      const currentHour = new Date().getHours();

      logger.info("PlaybackJob", "Checking for scheduled announcement", {
        hour: currentHour,
        minuteOffset,
      });

      try {
        const played = await playScheduledAnnouncementForHour(currentHour);

        if (played) {
          logger.info("PlaybackJob", "Announcement played successfully", {
            hour: currentHour,
          });
        } else {
          logger.info("PlaybackJob", "No announcement scheduled for this hour", {
            hour: currentHour,
          });
        }
      } catch (err: any) {
        logger.error("PlaybackJob", "Failed to play announcement", {
          hour: currentHour,
          error: err.message,
        });
      }
    },
    { timezone: config.locutor.timezone }
  );

  logger.info(
    "PlaybackJob",
    `Registered playback job at minute ${minuteOffset} of every hour (varies per day)`
  );
}
