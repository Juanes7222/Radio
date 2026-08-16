import cron from "node-cron";
import { captureListenerSnapshot } from "./listenerHistory.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

/**
 * Toma una muestra de oyentes cada 5 minutos para alimentar la gráfica
 * del dashboard admin.
 */
export function registerListenerSamplingJob() {
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await captureListenerSnapshot();
      } catch (err) {
        logger.warn("ListenerSampling", "Snapshot capture failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
