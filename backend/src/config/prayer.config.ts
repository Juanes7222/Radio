import { envOr, intEnvOr } from "./env";

export const prayerConfig = {
  // Prayer requests and their bearer credentials are purged after this many
  // days. Set PRAYER_RETENTION_DAYS to 0 (or a negative value) to disable it.
  retentionDays: intEnvOr("PRAYER_RETENTION_DAYS", 365),
  // Daily at 04:30 in the configured TIMEZONE.
  purgeCron: envOr("PRAYER_PURGE_CRON", "30 4 * * *"),
  // Policy version stamped on every accepted consent. It must match the
  // "updatedAt" date of the published data treatment policy, and it is set by
  // the server so the evidence does not depend on the client.
  consentVersion: envOr("PRAYER_CONSENT_VERSION", "2026-08-18"),
};
