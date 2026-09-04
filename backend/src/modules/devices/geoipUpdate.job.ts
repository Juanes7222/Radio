import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { isDatabaseStale, updateDbIpDatabase, updateGeoIpDatabase } from "./geoipUpdate.service";

/**
 * Registra el cron de actualización de MaxMind GeoLite2-City.
 *
 * - MaxMind publica martes y viernes. Cron por defecto: 03:00 mar/vie (America/Bogota).
 * - Si GEOIP_UPDATE_ENABLED=false no hace nada (útil si prefieres actualizar
 *   manualmente o con geoipupdate externo).
 * - Al arrancar, si GEOIP_UPDATE_ON_STARTUP=true y el archivo no existe o es
 *   stale (>7 días), intenta descargar inmediatamente en background.
 */
export function registerGeoIpUpdateJob(): void {
  if (!config.geoip.updateEnabled) {
    logger.info("GeoIPUpdate", "Auto-update disabled (GEOIP_UPDATE_ENABLED=false)");
    return;
  }

  if (!config.geoip.licenseKey) {
    logger.warn("GeoIPUpdate", "GEOIP_LICENSE_KEY not set, auto-update will fail until configured");
  }

  if (!config.geoip.mmdbPath) {
    logger.warn("GeoIPUpdate", "GEOIP_MMDB_PATH not set, skipping schedule");
    return;
  }

  // Validar cron expression
  if (!cron.validate(config.geoip.updateCron)) {
    logger.warn("GeoIPUpdate", "Invalid GEOIP_UPDATE_CRON, using default", {
      cron: config.geoip.updateCron,
    });
  }

  const schedule = cron.validate(config.geoip.updateCron) ? config.geoip.updateCron : "0 3 * * 2,5";

  cron.schedule(
    schedule,
    async () => {
      try {
        logger.info("GeoIPUpdate", "Scheduled update starting");
        const [mmResult, dbipResult] = await Promise.all([updateGeoIpDatabase(), updateDbIpDatabase()]);
        logger.info("GeoIPUpdate", "Scheduled update completed", { mmResult, dbipResult });
      } catch (err) {
        logger.error("GeoIPUpdate", "Scheduled update failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { timezone: config.locutor.timezone }
  );

  logger.info("GeoIPUpdate", "Job scheduled (GeoLite + DB-IP)", {
    cron: schedule,
    timezone: config.locutor.timezone,
    mmdbPath: config.geoip.mmdbPath,
    dbipPath: config.geoip.dbipPath,
  });

  // Update on startup if file missing or stale.
  if (config.geoip.updateOnStartup) {
    void (async () => {
      try {
        const stale = await isDatabaseStale();
        if (!stale) {
          logger.info("GeoIPUpdate", "Databases fresh, skipping startup update");
          return;
        }
        logger.info("GeoIPUpdate", "Database stale or missing, running startup update");
        const [mmResult, dbipResult] = await Promise.all([updateGeoIpDatabase(), updateDbIpDatabase()]);
        logger.info("GeoIPUpdate", "Startup update result", { mmResult, dbipResult });
      } catch (err) {
        logger.warn("GeoIPUpdate", "Startup update failed (will retry on schedule)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }
}
