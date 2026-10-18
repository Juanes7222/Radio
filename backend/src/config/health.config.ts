import { envOr, listEnvOr } from "./env";
import { getBooleanSetting, getNumberSetting } from "../modules/settings/settings.cache";

/**
 * Every watchdog threshold comes from the settings cache, and this module is a
 * set of getters because that is what makes a saved value take effect: a getter
 * re-reads the hydrated cache on each access, so the next health cycle already
 * sees what the panel saved, with no restart.
 *
 * The interval is the one exception. `health.job.ts` reads it once, when it
 * registers the cron, and freezes the number into the cron expression, which is
 * why the catalog marks it `requiresRestart` instead of promising a live
 * change.
 *
 * `diskMountPath` and `pushTokens` deliberately stay on the environment: a
 * mount path is a fact about the machine rather than an editorial choice, and
 * the device list is an open product decision recorded in the design spec.
 */

// Getters keep values lazy so config can be imported after secrets load and the
// cache can be hydrated before the first read.
export const healthConfig = {
  /** How often the watchdog loop runs, in minutes. */
  get intervalMinutes() {
    return getNumberSetting("health.checkIntervalMinutes");
  },
  /** Silent AzuraCast now-playing for longer than this is a problem (seconds). */
  get nowPlayingSilenceSeconds() {
    return getNumberSetting("health.nowPlayingSilenceSeconds");
  },
  /** A backup older than this many hours marks the backup check as degraded. */
  get backupMaxAgeHours() {
    return getNumberSetting("health.backupMaxAgeHours");
  },
  /** Free-disk percentage below this marks the disk check as degraded. */
  get diskMinFreePercent() {
    return getNumberSetting("health.diskMinFreePercent");
  },
  /** Filesystem whose free space is watched (AzuraCast media lives here). */
  get diskMountPath() {
    return envOr("HEALTH_DISK_MOUNT_PATH", "/var/azuracast");
  },
  /** Send email notifications on human-action alerts. */
  get emailEnabled() {
    return getBooleanSetting("health.emailEnabled");
  },
  /** Send admin push notifications on human-action alerts. */
  get pushEnabled() {
    return getBooleanSetting("health.pushEnabled");
  },
  /**
   * FCM tokens of the devices that receive health alerts. Explicit because
   * the Device table is shared with the public app: there is no way to tell
   * an operator device apart from a listener device.
   */
  get pushTokens() {
    return listEnvOr("HEALTH_PUSH_TOKENS");
  },
  /** Hours without a listener snapshot before the snapshot check degrades. */
  get snapshotMaxAgeHours() {
    return getNumberSetting("health.snapshotMaxAgeHours");
  },
};
