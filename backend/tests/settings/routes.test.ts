import { describe, expect, it, vi } from "vitest";

// The router imports the auth guard, and that reaches the config module, which
// throws at import time when a required variable is missing. The helpers under
// test parse a request and nothing else, so the guard is replaced rather than
// the whole environment being satisfied.
vi.mock("../../src/modules/auth/auth.middleware", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Imported after the mock above, which vitest hoists ahead of every import.
import {
  asPlainObject,
  isStringArray,
  parseChangesLimit,
} from "../../src/modules/settings/settings.routes";
import { AppError } from "../../src/shared/errors/app-error";

/**
 * What a `?limit` that is not a plain positive integer must never become. Each
 * entry is a shape `parseChangesLimit` was written to catch rather than to
 * coerce: a value that reached Prisma as `NaN` or `0` would either fail deep
 * inside the client or silently answer nothing.
 */
const REJECTED_LIMITS: ReadonlyArray<{ label: string; raw: unknown }> = [
  { label: "a repeated parameter, which Express hands over as an array", raw: ["1", "2"] },
  { label: "zero", raw: "0" },
  { label: "a negative number", raw: "-1" },
  { label: "a fractional number", raw: "1.5" },
  { label: "an explicitly signed number", raw: "+5" },
  { label: "scientific notation, which Number would happily read", raw: "1e2" },
  { label: "an empty value, which is what a bare ?limit produces", raw: "" },
  { label: "whitespace only", raw: "   " },
  { label: "words", raw: "muchos" },
  { label: "a number the query parser coerced into something else", raw: 5 },
  { label: "null", raw: null },
];

describe("parseChangesLimit", () => {
  it("defaults to 50 when the panel sends no limit", () => {
    expect(parseChangesLimit(undefined)).toBe(50);
  });

  it("passes a value inside the cap through unchanged", () => {
    expect(parseChangesLimit("25")).toBe(25);
  });

  it("caps the value instead of rejecting it", () => {
    // Asking for more of the log is not a mistake worth an error.
    expect(parseChangesLimit("1000")).toBe(200);
    expect(parseChangesLimit("200")).toBe(200);
  });

  it("ignores the whitespace around a valid value", () => {
    expect(parseChangesLimit(" 25 ")).toBe(25);
  });

  it.each(REJECTED_LIMITS)("rejects $label", ({ raw }) => {
    expect(limitError(raw).statusCode).toBe(400);
  });

  it("explains the rejection in the words the panel shows", () => {
    expect(limitError("1.5").message).toBe(
      '"limit" debe ser un número entero positivo.'
    );
  });
});

describe("asPlainObject", () => {
  it("accepts a plain object", () => {
    const body = { "health.emailEnabled": false };

    expect(asPlainObject(body)).toEqual(body);
  });

  it("accepts an empty object, which is a save of nothing", () => {
    expect(asPlainObject({})).toEqual({});
  });

  it.each([
    ["null", null],
    ["an array", [{ key: "value" }]],
    ["a string", '{"health.emailEnabled":false}'],
    ["a number", 42],
    ["undefined", undefined],
  ])("rejects %s", (_label, body) => {
    // An array would answer a "saved" that saved nothing, and `null` is the
    // body an empty PUT arrives with.
    expect(asPlainObject(body)).toBeNull();
  });
});

describe("isStringArray", () => {
  it("accepts a list of keys", () => {
    const keys = ["health.emailEnabled", "health.diskMinFreePercent"];

    expect(isStringArray(keys)).toBe(true);
  });

  it("accepts an empty list, because resetting nothing is a valid answer", () => {
    expect(isStringArray([])).toBe(true);
  });

  it.each([
    ["a number inside the list", ["health.emailEnabled", 42]],
    ["an object inside the list", [{ key: "health.emailEnabled" }]],
    ["a bare string", "health.emailEnabled"],
    ["null", null],
    ["undefined", undefined],
    ["an object", { keys: ["health.emailEnabled"] }],
  ])("rejects %s", (_label, value) => {
    expect(isStringArray(value)).toBe(false);
  });
});

/** The error a synchronous rejection produced, narrowed without a cast. */
function limitError(raw: unknown): AppError {
  try {
    parseChangesLimit(raw);
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error(`Expected ${JSON.stringify(raw)} to be rejected`);
}
