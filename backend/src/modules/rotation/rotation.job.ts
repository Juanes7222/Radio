import cron from "node-cron";
import { runAllActiveRotations } from "./rotation.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

// Runs at 03:30 station time, after the locutor nightly generation, so the
// reading playlists are rebuilt before the programs air.
const CRON_SCHEDULE = "30 3 * * *";

export function registerRotationJob(): void {
  cron.schedule(
    CRON_SCHEDULE,
    () => {
      runAllActiveRotations()
        .then((results) => {
          logger.info("RotationJob", "Rotations finished", { count: results.length });
        })
        .catch((err) => {
          logger.error("RotationJob", "Rotations run failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    { timezone: config.locutor.timezone }
  );
}
