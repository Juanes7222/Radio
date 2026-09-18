import { boolEnvOr, intEnvOr, listEnvOr } from "./env";

function getHealthConfig() {
  return {
    /** How often the watchdog loop runs, in seconds. */
    intervalSeconds: intEnvOr("HEALTH_CHECK_INTERVAL_SECONDS", 120),
    /** Silent AzuraCast now-playing for longer than this is a problem (seconds). */
    nowPlayingSilenceSeconds: intEnvOr("HEALTH_NOW_PLAYING_SILENCE_SECONDS", 900),
    /** A backup older than this many hours marks the backup check as degraded. */
    backupMaxAgeHours: intEnvOr("HEALTH_BACKUP_MAX_AGE_HOURS", 26),
    /** Free-disk percentage below this marks the disk check as degraded. */
    diskMinFreePercent: intEnvOr("HEALTH_DISK_MIN_FREE_PERCENT", 15),
    /** Filesystem whose free space is watched (AzuraCast media lives here). */
    diskMountPath: process.env.HEALTH_DISK_MOUNT_PATH ?? "/var/azuracast",
    /** Send email notifications on human-action alerts. */
    emailEnabled: boolEnvOr("HEALTH_EMAIL_ENABLED", true),
    /** Send admin push notifications on human-action alerts. */
    pushEnabled: boolEnvOr("HEALTH_PUSH_ENABLED", false),
    /**
     * FCM tokens of the devices that receive health alerts. Explicit because
     * the Device table is shared with the public app: there is no way to tell
     * an operator device apart from a listener device.
     */
    pushTokens: listEnvOr("HEALTH_PUSH_TOKENS"),
    /** Hours without a listener snapshot before the snapshot check degrades. */
    snapshotMaxAgeHours: intEnvOr("HEALTH_SNAPSHOT_MAX_AGE_HOURS", 2),
  };
}

// Getters keep values lazy so config can be imported after secrets load.
export const healthConfig = {
  get intervalSeconds() {
    return getHealthConfig().intervalSeconds;
  },
  get nowPlayingSilenceSeconds() {
    return getHealthConfig().nowPlayingSilenceSeconds;
  },
  get backupMaxAgeHours() {
    return getHealthConfig().backupMaxAgeHours;
  },
  get diskMinFreePercent() {
    return getHealthConfig().diskMinFreePercent;
  },
  get diskMountPath() {
    return getHealthConfig().diskMountPath;
  },
  get emailEnabled() {
    return getHealthConfig().emailEnabled;
  },
  get pushEnabled() {
    return getHealthConfig().pushEnabled;
  },
  get pushTokens() {
    return getHealthConfig().pushTokens;
  },
  get snapshotMaxAgeHours() {
    return getHealthConfig().snapshotMaxAgeHours;
  },
};
