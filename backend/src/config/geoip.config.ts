import { boolEnvOr, envOr, intEnvOr } from "./env";

export const geoipConfig = {
  // Auto-assign a zone to devices without one based on their public IP.
  // Set GEOIP_ENABLED=false to keep zones fully manual.
  enabled: boolEnvOr("GEOIP_ENABLED", true),

  // Local databases. AzuraCast soporta ambos (ver App\Service\IpGeolocator):
  // - GeoLite2-City.mmdb (MaxMind, cuenta requerida, mar/vie) -> GEOIP_MMDB_PATH
  // - dbip-city-lite.mmdb (DB-IP, sin key, mensual) -> GEOIP_DBIP_PATH
  // Cuando existen se consultan en paralelo. Rutas relativas al cwd del backend
  // (pm2 cwd: /var/www/radio/backend, ej: storage/geoip/GeoLite2-City.mmdb).
  mmdbPath: envOr("GEOIP_MMDB_PATH", "storage/geoip/GeoLite2-City.mmdb"),
  dbipPath: envOr("GEOIP_DBIP_PATH", "storage/geoip/dbip-city-lite.mmdb"),

  // MaxMind auto-update. Requires a MaxMind account and license key.
  // When enabled the scheduler downloads GeoLite2-City twice a week.
  updateEnabled: boolEnvOr("GEOIP_UPDATE_ENABLED", false),
  licenseKey: envOr("GEOIP_LICENSE_KEY", ""),
  accountId: envOr("GEOIP_ACCOUNT_ID", ""),
  editionId: envOr("GEOIP_EDITION_ID", "GeoLite2-City"),
  // Cron martes y viernes 03:00 America/Bogota (MaxMind publica mar/vie).
  updateCron: envOr("GEOIP_UPDATE_CRON", "0 3 * * 2,5"),
  // Descarga también al arrancar si el archivo no existe.
  updateOnStartup: boolEnvOr("GEOIP_UPDATE_ON_STARTUP", true),

  // Trusted proxy handling for Cloudflare / CDN headers. Only enable when the
  // backend is actually behind that proxy; otherwise headers can be spoofed
  // by any client.
  trustProxyHeaders: boolEnvOr("GEOIP_TRUST_PROXY_HEADERS", false),

  // Legacy endpoint kept for backwards compatibility; prefer mmdb + ipwho.is.
  // ip-api.com free tier is HTTP only and has undocumented rate limits, so it
  // is no longer the default fallback.
  endpoint: envOr("GEOIP_ENDPOINT", "http://ip-api.com/json"),

  // Fallback APIs (sequential, not raced). ipwho.is is free (no key) and
  // ipapi.co is used as secondary fallback.
  ipWhoIsEndpoint: envOr("GEOIP_IPWHOIS_ENDPOINT", "https://ipwho.is"),
  ipApiCoEndpoint: envOr("GEOIP_IPAPICO_ENDPOINT", "https://ipapi.co"),

  cacheTtlSeconds: intEnvOr("GEOIP_CACHE_TTL_SECONDS", 86400),
  failureTtlSeconds: intEnvOr("GEOIP_FAILURE_TTL_SECONDS", 600),
  timeoutMs: intEnvOr("GEOIP_TIMEOUT_MS", 1500),
};
