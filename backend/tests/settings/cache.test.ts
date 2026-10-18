import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currentRows,
  getSetting,
  hydrateFromRows,
  resetCache,
  resolveFromRows,
  settingSource,
} from "../../src/modules/settings/settings.cache";

const ORIGINAL_DISK_MIN_FREE_PERCENT = process.env.HEALTH_DISK_MIN_FREE_PERCENT;

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
  beforeEach(() => {
    resetCache();
  });

  afterEach(() => {
    if (ORIGINAL_DISK_MIN_FREE_PERCENT === undefined) {
      delete process.env.HEALTH_DISK_MIN_FREE_PERCENT;
    } else {
      process.env.HEALTH_DISK_MIN_FREE_PERCENT = ORIGINAL_DISK_MIN_FREE_PERCENT;
    }
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

  it("falls back to the default and keeps reading when a stored value cannot be parsed", () => {
    hydrateFromRows([row("health.emailEnabled", "not-a-boolean")]);

    expect(getSetting("health.emailEnabled")).toBe(true);
    expect(settingSource("health.emailEnabled")).toBe("default");
  });

  it("reports 'env' for a key backed by an environment variable that is set", () => {
    // The catalog reads HEALTH_DISK_MIN_FREE_PERCENT lazily, so the cache
    // resolves it at read time and this test does not mutate process.env.
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
});
