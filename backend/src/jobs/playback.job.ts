import cron from "node-cron";
import { playScheduledAnnouncementForHour } from "../services/playbackAzuracast.service";
import { config } from "../config";
import { logger } from "../utils/logger";

export function registerPlaybackJob() {
  cron.schedule(
    "0 * * * *",
    async () => {
      const currentHour = new Date().getHours();

      logger.info("PlaybackJob", "Checking for scheduled announcement", {
        hour: currentHour,
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

  logger.info("PlaybackJob", "Registered playback job at minute 0 of every hour");
}
