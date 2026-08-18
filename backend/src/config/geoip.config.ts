import { envOr, intEnvOr } from "./env";

export const geoipConfig = {
  // Auto-assign a zone to devices without one based on their public IP.
  // Set GEOIP_ENABLED=false to keep zones fully manual.
  enabled: envOr("GEOIP_ENABLED", "true") === "true",
  // ip-api.com free tier: no key required, HTTP only, ~45 requests/minute.
  endpoint: envOr("GEOIP_ENDPOINT", "http://ip-api.com/json"),
  cacheTtlSeconds: intEnvOr("GEOIP_CACHE_TTL_SECONDS", 86400),
  failureTtlSeconds: intEnvOr("GEOIP_FAILURE_TTL_SECONDS", 600),
  timeoutMs: intEnvOr("GEOIP_TIMEOUT_MS", 2500),
};