import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/**
 * Every threshold the watchdog reads has to come from the settings cache.
 * A getter left reading process.env would keep working silently, and the panel
 * would show a value that nothing consumes.
 *
 * A source test, because `health.config.ts` throws at import time when a
 * required environment variable is missing: importing it would need the whole
 * environment, secrets included.
 */
describe("health config wiring", () => {
  const config = readFileSync(join(srcRoot, "config", "health.config.ts"), "utf8");

  it("no longer reads thresholds from the environment", () => {
    const moved = [
      "HEALTH_NOW_PLAYING_SILENCE_SECONDS",
      "HEALTH_BACKUP_MAX_AGE_HOURS",
      "HEALTH_DISK_MIN_FREE_PERCENT",
      "HEALTH_SNAPSHOT_MAX_AGE_HOURS",
      "HEALTH_EMAIL_ENABLED",
      "HEALTH_PUSH_ENABLED",
      "HEALTH_CHECK_INTERVAL_SECONDS",
    ];

    for (const key of moved) {
      expect(config).not.toContain(key);
    }
  });

  it("exposes the check interval in minutes", () => {
    expect(config).toContain("intervalMinutes");
    expect(config).not.toContain("intervalSeconds");
  });

  it("keeps the mount path and the device list on the environment", () => {
    // Both were left out of the catalog on purpose: a mount path is a fact
    // about the machine, and the device list is an open product decision
    // recorded in the design spec. The absence assertions above would not
    // notice them moving, so their presence is what pins that decision.
    expect(config).toContain("HEALTH_DISK_MOUNT_PATH");
    expect(config).toContain("HEALTH_PUSH_TOKENS");
  });

  it("names every catalogued threshold and imports the cache reader", () => {
    expect(config).toContain('from "../modules/settings/settings.cache"');

    const thresholds = [
      "health.checkIntervalMinutes",
      "health.nowPlayingSilenceSeconds",
      "health.backupMaxAgeHours",
      "health.diskMinFreePercent",
      "health.snapshotMaxAgeHours",
      "health.emailEnabled",
      "health.pushEnabled",
    ];

    for (const key of thresholds) {
      expect(config).toContain(`"${key}"`);
    }
  });

  it("leaves the narrowing readers to the settings module", () => {
    // A config module derives nothing from the catalog's internals: it consumes
    // the cache's public readers. Four more config modules migrate in later
    // phases, and none of them should restate the key types.
    expect(config).not.toContain("SETTINGS_CATALOG");
    expect(config).not.toContain("SettingKey");
    expect(config).not.toContain("defaultValue");
  });
});
