import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeSettingValue,
  parseSettingInput,
} from "../../src/modules/settings/settings.validation";

/** The only two environment variables the settings exercised below read. */
const ORIGINAL_ENV = {
  HEALTH_EMAIL_ENABLED: process.env.HEALTH_EMAIL_ENABLED,
  HEALTH_DISK_MIN_FREE_PERCENT: process.env.HEALTH_DISK_MIN_FREE_PERCENT,
};

// The catalog reads these lazily, so an ambient value would leak into the
// expectations. Every test starts with both unset and puts back whatever the
// shell that ran the suite had, so the result does not depend on it.
beforeEach(() => {
  delete process.env.HEALTH_EMAIL_ENABLED;
  delete process.env.HEALTH_DISK_MIN_FREE_PERCENT;
});

afterEach(() => {
  restoreEnv("HEALTH_EMAIL_ENABLED");
  restoreEnv("HEALTH_DISK_MIN_FREE_PERCENT");
});

describe("parseSettingInput", () => {
  it("rejects a key that is not in the catalog", () => {
    const result = parseSettingInput("health.nope", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("health.nope");
  });

  it("rejects a value outside the declared range", () => {
    const result = parseSettingInput("health.diskMinFreePercent", 0);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("1");
  });

  it("rejects a value whose type does not match the definition", () => {
    const result = parseSettingInput("health.emailEnabled", "sí");

    expect(result.ok).toBe(false);
  });

  it("accepts a valid value inside the range", () => {
    const result = parseSettingInput("health.diskMinFreePercent", 20);

    expect(result).toEqual({ ok: true, value: 20 });
  });

  it("names the key and both bounds when the value is out of range", () => {
    // The message is what the panel shows under the field, so it has to carry
    // what to fix and not only that something is wrong.
    const result = parseSettingInput("health.diskMinFreePercent", 100);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("health.diskMinFreePercent");
      expect(result.error).toContain("1");
      expect(result.error).toContain("99");
    }
  });

  it("rejects a boolean for a numeric setting instead of coercing it", () => {
    const result = parseSettingInput("health.diskMinFreePercent", true);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("health.diskMinFreePercent");
  });

  it("rejects text that is not a number for a numeric setting", () => {
    const result = parseSettingInput("health.diskMinFreePercent", "mucho");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("health.diskMinFreePercent");
  });

  it("does not read the environment to decide", () => {
    process.env.HEALTH_DISK_MIN_FREE_PERCENT = "42";

    // The environment only seeds a read. A write is accepted or rejected by the
    // catalog alone, so the same payload behaves the same on every station.
    expect(parseSettingInput("health.diskMinFreePercent", 100).ok).toBe(false);
  });
});

describe("normalizeSettingValue", () => {
  it("serializes a boolean to the lowercase form parse() accepts", () => {
    expect(normalizeSettingValue("health.emailEnabled", false)).toBe("false");
  });

  it("round-trips through the catalog parse", () => {
    const raw = normalizeSettingValue("health.diskMinFreePercent", 20);

    expect(parseSettingInput("health.diskMinFreePercent", raw)).toEqual({
      ok: true,
      value: 20,
    });
  });

  it("refuses to format a key the catalog does not know", () => {
    // Without a definition there is nothing to format with, and a row written
    // that way could never be read back, so this fails loudly.
    expect(() => normalizeSettingValue("health.nope", 1)).toThrow("health.nope");
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