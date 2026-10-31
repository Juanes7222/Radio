import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { refreshChannelSubscriptions } from "./subscription.service";

export function registerYoutubeSubscriptionJob() {
  // Polling is the transport of record: YouTube's public feed no longer serves
  // entries, so the hub cannot push anything. Fifteen minutes keeps a 10 minute
  // video close to air without spending more than 1.500 quota units a day for
  // ten channels.
  //
  // Minute 7 on purpose: every other job in this project runs on a round minute
  // and sharing the second would pile the hub calls onto the same instant.
  cron.schedule(
    "7,22,37,52 * * * *",
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
