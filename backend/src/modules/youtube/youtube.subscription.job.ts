import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { refreshChannelSubscriptions } from "./subscription.service";

export function registerYoutubeSubscriptionJob() {
  // The lease lasts 24 hours, so a 6 hour pass leaves three tries before it
  // actually lapses. The interval used to be a hand-written setInterval in the
  // bootstrap, which put the cadence outside every config file.
  //
  // Minute 17 on purpose: every other job in this project runs on a round minute
  // and sharing the second would pile the hub calls onto the same instant.
  cron.schedule(
    "17 */6 * * *",
    async () => {
      try {
        await refreshChannelSubscriptions();
      } catch (err) {
        logger.error("YoutubeSubscriptions", "Refresh failed", { error: String(err) });
      }
    },
    { timezone: config.locutor.timezone }
  );
}