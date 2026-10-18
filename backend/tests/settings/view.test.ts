import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDefinition,
  SETTINGS_CATALOG,
} from "../../src/modules/settings/settings.catalog";
import {
  buildSettingsView,
  REDACTED_PLACEHOLDER,
  redactForAudit,
} from "../../src/modules/settings/settings.view";
import type { SettingRow } from "../../src/modules/settings/settings.types";

/** The environment variables the keys exercised below resolve through. */
const ORIGINAL_ENV = {
  HEALTH_EMAIL_ENABLED: process.env.HEALTH_EMAIL_ENABLED,
  HEALTH_DISK_MIN_FREE_PERCENT: process.env.HEALTH_DISK_MIN_FREE_PERCENT,
};

// The catalog reads these lazily, so an ambient value would leak into the
// expectations: with HEALTH_DISK_MIN_FREE_PERCENT set, the item below would
// report source "env" instead of "default". Every test starts with both unset
// and puts back whatever the shell that ran the suite had.
beforeEach(() => {
  delete process.env.HEALTH_EMAIL_ENABLED;
  delete process.env.HEALTH_DISK_MIN_FREE_PERCENT;
});

afterEach(() => {
  restoreEnv("HEALTH_EMAIL_ENABLED");
  restoreEnv("HEALTH_DISK_MIN_FREE_PERCENT");
});

const row = (key: string, value: string): SettingRow => ({
  key,
  value,
  updatedAt: new Date("2026-10-18T12:00:00Z"),
  updatedBy: "admin@radio",
});

describe("buildSettingsView", () => {
  it("groups the catalog into sections in the declared order", () => {
    const sections = buildSettingsView(new Map());

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("health");
    expect(sections[0].items.length).toBe(Object.keys(SETTINGS_CATALOG).length);
  });

  it("flags a setting that only takes effect after a restart", () => {
    const sections = buildSettingsView(new Map());
    const interval = sections[0].items.find(
      (item) => item.key === "health.checkIntervalMinutes"
    );

    expect(interval?.requiresRestart).toBe(true);
  });

  it("reports the stored value and its source when a row exists", () => {
    const sections = buildSettingsView(
      new Map([["health.diskMinFreePercent", row("health.diskMinFreePercent", "20")]])
    );
    const item = sections[0].items.find(
      (entry) => entry.key === "health.diskMinFreePercent"
    );

    expect(item?.value).toBe(20);
    expect(item?.source).toBe("panel");
    expect(item?.min).toBe(1);
    expect(item?.max).toBe(99);
    expect(item?.unit).toBe("%");
  });

  it("carries the range for a setting with no row, so the form can constrain it", () => {
    const sections = buildSettingsView(new Map());
    const item = sections[0].items.find((entry) => entry.key === "health.diskMinFreePercent");

    expect(item?.source).toBe("default");
    expect(item?.min).toBe(1);
  });

  // The two tests above fix the "panel" and "default" ends of the precedence;
  // this one fixes the middle, which is where an operator lands when the
  // station still carries the variable in its environment.
  it("names the environment as the source when it overrides the default", () => {
    process.env.HEALTH_DISK_MIN_FREE_PERCENT = "42";
    const sections = buildSettingsView(new Map());
    const item = sections[0].items.find((entry) => entry.key === "health.diskMinFreePercent");

    expect(item?.value).toBe(42);
    expect(item?.source).toBe("env");
  });

  it("reports who changed the value and when, as a date the panel can print", () => {
    const sections = buildSettingsView(
      new Map([["health.diskMinFreePercent", row("health.diskMinFreePercent", "20")]])
    );
    const item = sections[0].items.find(
      (entry) => entry.key === "health.diskMinFreePercent"
    );

    expect(item?.updatedAt).toBe("2026-10-18T12:00:00.000Z");
    expect(item?.updatedBy).toBe("admin@radio");
  });

  it("leaves the audit fields empty for a setting nobody has stored", () => {
    const sections = buildSettingsView(new Map());
    const item = sections[0].items.find((entry) => entry.key === "health.diskMinFreePercent");

    expect(item?.updatedAt).toBeNull();
    expect(item?.updatedBy).toBeNull();
  });

  it("does not ask for a restart on a setting that is read live", () => {
    const sections = buildSettingsView(new Map());
    const silence = sections[0].items.find(
      (item) => item.key === "health.nowPlayingSilenceSeconds"
    );

    // The flag the panel shows as "surte efecto al reiniciar" is false for the
    // six entries that do not declare it, not absent.
    expect(silence?.requiresRestart).toBe(false);
  });

  it("keeps the order the catalog declares, so the panel paints it as written", () => {
    const sections = buildSettingsView(new Map());

    expect(sections[0].items.map((item) => item.key)).toEqual(
      Object.keys(SETTINGS_CATALOG)
    );
  });
});

describe("getDefinition", () => {
  // The catalog is an object literal, so a request-derived key can name a
  // property it inherits from Object.prototype. Those are not definitions, and
  // treating them as such is what made the redaction below fail open.
  it("returns null for a key inherited from Object.prototype", () => {
    expect(getDefinition("constructor")).toBeNull();
    expect(getDefinition("toString")).toBeNull();
  });
});

describe("redactForAudit", () => {
  // Phase 1 ships no sensitive key, so the mechanism is pinned against
  // `health.pushTokens`, a key the catalog does not know yet: a definition the
  // catalog cannot vouch for is redacted rather than written in clear text.
  it("hides the value of a key the catalog marks sensitive", () => {
    expect(redactForAudit("health.pushTokens", "token-abc")).toBe(REDACTED_PLACEHOLDER);
  });

  it("keeps the value of an ordinary key", () => {
    expect(redactForAudit("health.diskMinFreePercent", "20")).toBe("20");
  });

  it("keeps null as null", () => {
    expect(redactForAudit("health.diskMinFreePercent", null)).toBeNull();
  });

  // Fail-closed covers every key the catalog cannot vouch for, and an inherited
  // property is a key it cannot vouch for even though the lookup returns
  // something truthy for it.
  it("hides the value of a key inherited from Object.prototype", () => {
    expect(redactForAudit("constructor", "x")).toBe(REDACTED_PLACEHOLDER);
    expect(redactForAudit("toString", "x")).toBe(REDACTED_PLACEHOLDER);
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
