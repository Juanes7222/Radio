import cron from "node-cron";
import { recoverStaleJobs } from "./jobDispatcher";
import { config } from "../config";
import { logger } from "../utils/logger";

export function registerJobRecovery() {
  cron.schedule(
    "*/5 * * * *",
    async () => {
      logger.info("JobRecovery", "Running stale job recovery");
      try {
        await recoverStaleJobs();
      } catch (err) {
        logger.error("JobRecovery", "Recovery failed", { error: String(err) });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
