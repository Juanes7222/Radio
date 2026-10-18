import { describe, expect, it } from "vitest";
import { AppError } from "../../src/shared/errors/app-error";
import { applyPatch, resetKeys } from "../../src/modules/settings/settings.service";

/**
 * Rejection cases only, and that is a deliberate limit: every one of them is
 * answered before the first Prisma call, so the suite keeps running without a
 * database — the same rule the rest of `backend/tests` follows. The assertion
 * that pins it is `statusCode === 400`: a failure that had reached Prisma would
 * not be an `AppError` at all.
 */
describe("applyPatch", () => {
  // An old panel can send a key this version retired. Ignoring it would make the
  // panel report "saved" over a change that never happened.
  it("rejects a key that is not in the catalog instead of ignoring it", async () => {
    const error = await rejection(applyPatch({ "health.retiredKey": 42 }, "admin@radio"));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("health.retiredKey");
  });

  // Same reasoning one level deeper: the catalog lookup is own-property only,
  // and this is where a request-derived key could reach it.
  it("rejects a key inherited from Object.prototype", async () => {
    const error = await rejection(applyPatch({ toString: "x" }, "admin@radio"));

    expect(error.statusCode).toBe(400);
  });

  // The catalog declares the range, so this is the operator being told why
  // rather than having the number moved under them.
  it("rejects a value outside the range the catalog declares", async () => {
    const error = await rejection(
      applyPatch({ "health.diskMinFreePercent": 500 }, "admin@radio")
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("health.diskMinFreePercent");
  });

  // One bad key rejects the whole patch, so a save is never half applied.
  it("rejects a patch whose other keys are valid", async () => {
    const error = await rejection(
      applyPatch(
        {
          "health.emailEnabled": false,
          "health.diskMinFreePercent": 500,
        },
        "admin@radio"
      )
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("health.diskMinFreePercent");
  });

  it("reports nothing applied for an empty patch", async () => {
    await expect(applyPatch({}, "admin@radio")).resolves.toEqual({ applied: [] });
  });
});

describe("resetKeys", () => {
  it("rejects a key that is not in the catalog", async () => {
    const error = await rejection(resetKeys(["health.retiredKey"], "admin@radio"));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("health.retiredKey");
  });
});

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );

  if (!(error instanceof AppError)) {
    throw new Error(`Expected an AppError, received: ${String(error)}`);
  }
  return error;
}
