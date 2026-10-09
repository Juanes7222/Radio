import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { capturePlaybackHistory } from "./playbackHistory";

/**
 * Mirrors the AzuraCast playback history into the local table. The query
 * window overlaps between runs and the insert is idempotent, so the frequency
 * does not affect how complete the stored history ends up being.
 */
export function registerPlaybackHistoryJob() {
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await capturePlaybackHistory();
      } catch (err) {
        logger.warn("PlaybackHistory", "Capture failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
