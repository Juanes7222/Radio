import { describe, expect, it } from "vitest";
import {
  buildDailyActive,
  computeRetention,
  dayIndex,
  dayKeyFromIndex,
  type ActivityEntry,
} from "../../src/modules/telemetry/telemetry.analytics";
import {
  fingerprintError,
  isValidDeviceId,
  normalizeMessage,
  normalizePlatform,
  parseWindowDays,
} from "../../src/modules/telemetry/telemetry.utils";
import { AppError } from "../../src/shared/errors/app-error";

const LAST_DAY = "2026-11-30";

function entry(deviceId: string, day: string): ActivityEntry {
  return { deviceId, day };
}

describe("dayIndex", () => {
  it("maps a calendar day to a comparable index", () => {
    const first = dayIndex("2026-11-29");
    const second = dayIndex("2026-11-30");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect((second ?? 0) - (first ?? 0)).toBe(1);
  });

  it("round-trips through dayKeyFromIndex", () => {
    const index = dayIndex(LAST_DAY);
    expect(index).not.toBeNull();
    expect(dayKeyFromIndex(index ?? 0)).toBe(LAST_DAY);
  });

  it.each([
    ["a shorter key", "2026-11-3"],
    ["a timestamp", "2026-11-30T10:00:00Z"],
    ["an impossible date", "2026-02-30"],
    ["an impossible month", "2026-13-01"],
    ["an empty value", ""],
  ])("rejects %s", (_label, value) => {
    expect(dayIndex(value)).toBeNull();
  });
});

describe("buildDailyActive", () => {
  it("fills the days without activity with zero", () => {
    const points = buildDailyActive([entry("a", "2026-11-30")], 3, LAST_DAY);

    expect(points).toEqual([
      { day: "2026-11-28", devices: 0 },
      { day: "2026-11-29", devices: 0 },
      { day: "2026-11-30", devices: 1 },
    ]);
  });

  it("counts a device once per day even when it reports twice", () => {
    const points = buildDailyActive(
      [entry("a", "2026-11-30"), entry("a", "2026-11-30"), entry("b", "2026-11-30")],
      1,
      LAST_DAY
    );

    expect(points[0]?.devices).toBe(2);
  });

  it("ignores days outside the window", () => {
    const points = buildDailyActive(
      [entry("a", "2026-11-01"), entry("b", "2026-11-30")],
      2,
      LAST_DAY
    );

    expect(points).toEqual([
      { day: "2026-11-29", devices: 0 },
      { day: "2026-11-30", devices: 1 },
    ]);
  });
});

describe("computeRetention", () => {
  const entries: ActivityEntry[] = [
    // Started 30 days before the last day and came back on d1, d7 and d30.
    entry("a", "2026-10-31"),
    entry("a", "2026-11-01"),
    entry("a", "2026-11-07"),
    entry("a", "2026-11-30"),
    // Same cohort, never came back.
    entry("b", "2026-10-31"),
    // Started yesterday: only d1 can be evaluated for it.
    entry("c", "2026-11-29"),
    entry("c", "2026-11-30"),
  ];

  it("counts the cohort once per device", () => {
    expect(computeRetention(entries, LAST_DAY).cohort).toBe(3);
  });

  it("only puts in the denominator the devices old enough for that day", () => {
    const report = computeRetention(entries, LAST_DAY);

    expect(report.d1.eligible).toBe(3);
    expect(report.d7.eligible).toBe(2);
    expect(report.d30.eligible).toBe(2);
  });

  it("counts a return on the exact day, not any later one", () => {
    const report = computeRetention(entries, LAST_DAY);

    expect(report.d1.retained).toBe(2);
    expect(report.d7.retained).toBe(1);
    expect(report.d30.retained).toBe(1);
  });

  it("reports the rate as a percentage with one decimal", () => {
    const report = computeRetention(entries, LAST_DAY);

    expect(report.d1.rate).toBe(66.7);
    expect(report.d7.rate).toBe(50);
    expect(report.d30.rate).toBe(50);
  });

  it("returns null instead of a misleading zero when nobody is eligible", () => {
    const report = computeRetention([entry("a", LAST_DAY)], LAST_DAY);

    expect(report.d1.eligible).toBe(0);
    expect(report.d1.rate).toBeNull();
    expect(report.d30.rate).toBeNull();
  });

  it("treats a later visit as the same cohort, not a new one", () => {
    const report = computeRetention(
      [entry("a", "2026-10-31"), entry("a", LAST_DAY)],
      LAST_DAY
    );

    expect(report.cohort).toBe(1);
    expect(report.d30.retained).toBe(1);
  });
});

describe("fingerprintError", () => {
  const stack = [
    "Error: boom",
    "    at playStation (C:\\app\\src\\player.ts:42:13)",
    "    at onPress (C:\\app\\src\\index.tsx:10:5)",
    "    at renderWithHooks (C:\\app\\src\\render.ts:3:3)",
  ].join("\n");

  it("is stable across builds that only shift line numbers", () => {
    const nextBuild = [
      "Error: boom",
      "    at playStation (C:\\app\\src\\player.ts:57:21)",
      "    at onPress (C:\\app\\src\\index.tsx:22:9)",
      "    at renderWithHooks (C:\\app\\src\\render.ts:8:8)",
    ].join("\n");

    expect(fingerprintError("boom", nextBuild)).toBe(fingerprintError("boom", stack));
  });

  it("separates different messages", () => {
    expect(fingerprintError("boom", stack)).not.toBe(fingerprintError("bang", stack));
  });

  it("ignores frames past the third one", () => {
    const deeper = `${stack}\n    at timeout (C:\\app\\src\\timer.ts:1:1)`;
    expect(fingerprintError("boom", deeper)).toBe(fingerprintError("boom", stack));
  });

  it("works without a stack", () => {
    expect(fingerprintError("boom", null)).toBe(fingerprintError("boom", null));
    expect(fingerprintError("boom", null)).not.toBe(fingerprintError("boom", stack));
  });
});

describe("parseWindowDays", () => {
  it("defaults to 30 days", () => {
    expect(parseWindowDays(undefined)).toBe(30);
  });

  it("passes a valid value through", () => {
    expect(parseWindowDays("7")).toBe(7);
  });

  it("caps the window instead of failing", () => {
    expect(parseWindowDays("1000")).toBe(180);
  });

  it.each([
    ["zero", "0"],
    ["a negative number", "-1"],
    ["a fractional number", "1.5"],
    ["scientific notation", "1e2"],
    ["an empty value", ""],
    ["words", "mes"],
    ["a repeated parameter", ["1", "2"]],
    ["a number instead of a string", 7],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseWindowDays(raw)).toThrow(AppError);
  });
});

describe("request validation", () => {
  it("accepts the identifier the app already sends", () => {
    expect(isValidDeviceId("8f14e45f-ceea-4b7a-9f4c-0123456789ab")).toBe(true);
  });

  it.each([["too short", "abc"], ["an empty value", ""], ["an object", {}]])(
    "rejects a device identifier that is %s",
    (_label, value) => {
      expect(isValidDeviceId(value)).toBe(false);
    }
  );

  it("rejects an empty error message", () => {
    expect(() => normalizeMessage("   ")).toThrow(AppError);
  });

  it("truncates an oversized error message", () => {
    expect(normalizeMessage("x".repeat(900))).toHaveLength(500);
  });

  it("keeps only the platforms the app reports", () => {
    expect(normalizePlatform("ANDROID")).toBe("android");
    expect(normalizePlatform("windows")).toBeNull();
    expect(normalizePlatform(undefined)).toBeNull();
  });
});
