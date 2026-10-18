import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currentRows,
  getBooleanSetting,
  getNumberSetting,
  getSetting,
  hydrateFromRows,
  resetCache,
  resolveFromRows,
  settingSource,
} from "../../src/modules/settings/settings.cache";

/** The only two environment variables the catalogued keys below read. */
const ORIGINAL_ENV = {
  HEALTH_EMAIL_ENABLED: process.env.HEALTH_EMAIL_ENABLED,
  HEALTH_DISK_MIN_FREE_PERCENT: process.env.HEALTH_DISK_MIN_FREE_PERCENT,
};

function row(
  key: string,
  value: string,
  updatedBy: string | null = "admin@radio",
) {
  return {
    key,
    value,
    updatedAt: new Date("2026-10-18T12:00:00Z"),
    updatedBy,
  };
}

describe("settings cache", () => {
  // The catalog reads these lazily, so an ambient value would leak into the
  // expectations. Every test starts with both unset and puts back whatever
  // the shell that ran the suite had, so the result does not depend on it.
  beforeEach(() => {
    resetCache();
    delete process.env.HEALTH_EMAIL_ENABLED;
    delete process.env.HEALTH_DISK_MIN_FREE_PERCENT;
  });

  afterEach(() => {
    restoreEnv("HEALTH_EMAIL_ENABLED");
    restoreEnv("HEALTH_DISK_MIN_FREE_PERCENT");
  });

  it("reports the default and source 'default' for a key that was never stored", () => {
    expect(getSetting("health.emailEnabled")).toBe(true);
    expect(settingSource("health.emailEnabled")).toBe("default");
  });

  it("returns the stored value and source 'panel' once a row exists", () => {
    hydrateFromRows([row("health.emailEnabled", "false")]);

    expect(getSetting("health.emailEnabled")).toBe(false);
    expect(settingSource("health.emailEnabled")).toBe("panel");
    expect(currentRows().get("health.emailEnabled")?.updatedBy).toBe("admin@radio");
  });

  it("falls back to the default when a stored value cannot be parsed", () => {
    hydrateFromRows([row("health.emailEnabled", "not-a-boolean")]);

    // A corrupt row is discarded, and with the environment unset what is left
    // is the catalog default.
    expect(getSetting("health.emailEnabled")).toBe(true);
    expect(settingSource("health.emailEnabled")).toBe("default");
  });

  it("falls back to the environment when a stored value cannot be parsed", () => {
    process.env.HEALTH_EMAIL_ENABLED = "false";
    hydrateFromRows([row("health.emailEnabled", "not-a-boolean")]);

    // The corrupt row is discarded, so the environment answers — not the
    // default. Naming the source is the only way a panel can explain this.
    expect(getSetting("health.emailEnabled")).toBe(false);
    expect(settingSource("health.emailEnabled")).toBe("env");
  });

  it("reports 'default' for a key whose environment variable is not set", () => {
    // The catalog reads HEALTH_DISK_MIN_FREE_PERCENT lazily, so the cache
    // resolves it at read time: unset here means the value is the default.
    expect(getSetting("health.diskMinFreePercent")).toBe(15);
    expect(settingSource("health.diskMinFreePercent")).toBe("default");
  });

  it("returns null and source 'default' for a key that is not in the catalog", () => {
    expect(getSetting("health.retiredKey")).toBeNull();
    expect(settingSource("health.retiredKey")).toBe("default");
    expect(resolveFromRows("health.retiredKey", new Map())).toEqual({
      value: null,
      source: "default",
    });
  });

  it("ignores a row whose key is not in the catalog and keeps reading", () => {
    hydrateFromRows([row("health.retiredKey", "42"), row("health.emailEnabled", "false")]);

    expect(getSetting("health.retiredKey")).toBeNull();
    expect(getSetting("health.emailEnabled")).toBe(false);
  });

  it("reads the rows it receives instead of the hydrated cache", () => {
    const rows = new Map([["health.diskMinFreePercent", row("health.diskMinFreePercent", "42", null)]]);

    expect(resolveFromRows("health.diskMinFreePercent", rows)).toEqual({
      value: 42,
      source: "panel",
    });
    // The module cache was never hydrated, so the read above cannot have leaked into it.
    expect(getSetting("health.diskMinFreePercent")).toBe(15);
    expect(currentRows().size).toBe(0);
  });

  it("reports source 'env' when the environment overrides the default", () => {
    process.env.HEALTH_DISK_MIN_FREE_PERCENT = "20";

    expect(getSetting("health.diskMinFreePercent")).toBe(20);
    expect(settingSource("health.diskMinFreePercent")).toBe("env");

    // A stored row always wins over the environment.
    hydrateFromRows([row("health.diskMinFreePercent", "30")]);
    expect(getSetting("health.diskMinFreePercent")).toBe(30);
    expect(settingSource("health.diskMinFreePercent")).toBe("panel");
  });

  // The typed readers are what a config module calls, so they are the only
  // path by which a threshold reaches the watchdog. A reader stuck on the
  // default would leave every other assertion in this file green.
  it("answers the stored number, not the default", () => {
    hydrateFromRows([row("health.diskMinFreePercent", "30")]);

    // The catalog default is 15, so 30 can only have come from the row.
    expect(getNumberSetting("health.diskMinFreePercent")).toBe(30);
  });

  it("answers the stored boolean, not the default", () => {
    hydrateFromRows([row("health.emailEnabled", "false")]);

    // The catalog default is true, so false can only have come from the row.
    expect(getBooleanSetting("health.emailEnabled")).toBe(false);
  });

  it("answers an already typed default for a key that was never stored", () => {
    // A null reaching a consumer comparing a number would make the comparison
    // false forever, so the reader owes the caller the key's own type.
    expect(getNumberSetting("health.diskMinFreePercent")).toBe(15);
    expect(getBooleanSetting("health.emailEnabled")).toBe(true);
  });

  it("falls back instead of throwing when a stored number cannot be parsed", () => {
    process.env.HEALTH_DISK_MIN_FREE_PERCENT = "20";
    hydrateFromRows([row("health.diskMinFreePercent", "mucho")]);

    // The corrupt row is discarded, so the environment answers, and it answers
    // as a number rather than as the string the environment holds.
    expect(getNumberSetting("health.diskMinFreePercent")).toBe(20);
  });

  it("falls back to the default when a stored boolean cannot be parsed", () => {
    hydrateFromRows([row("health.emailEnabled", "not-a-boolean")]);

    // The environment is unset here, so what is left is the catalog default.
    expect(getBooleanSetting("health.emailEnabled")).toBe(true);
  });
});

function restoreEnv(key: keyof typeof ORIGINAL_ENV): void {
  const original = ORIGINAL_ENV[key];
  if (original === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = original;
}
