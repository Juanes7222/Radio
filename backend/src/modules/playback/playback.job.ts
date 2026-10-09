import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { capturePlaybackHistory } from "./playbackHistory";

/**
 * Sincroniza el historial de reproducción de AzuraCast con la tabla local.
 * La ventana de consulta se solapa entre corridas y el insert es idempotente,
 * así que la frecuencia no afecta la completitud del historial.
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