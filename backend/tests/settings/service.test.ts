import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/shared/errors/app-error";
import { currentRows, getSetting, resetCache, settingSource } from "../../src/modules/settings/settings.cache";

/**
 * The Prisma module is replaced rather than reached: every test here either
 * rejects before the first query or needs a query to fail on purpose, so the
 * suite needs no database, no fixture and no migrations.
 */
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("../../src/infrastructure/database/prisma", () => ({
  prisma: { stationSetting: { findMany } },
}));

// Imported after the mock above, which vitest hoists ahead of every import.
import { applyPatch, hydrateSettings, resetKeys } from "../../src/modules/settings/settings.service";

const row = {
  key: "health.emailEnabled",
  value: "false",
  updatedAt: new Date("2026-10-18T12:00:00Z"),
  updatedBy: "admin@radio",
};

/** Everything the module logged through `console` while the test ran. */
let logged: string[] = [];

beforeEach(() => {
  findMany.mockReset();
  resetCache();
  logged = [];

  // The service logs through the shared logger, which writes to `console`. The
  // warning that fail-soft must emit is asserted below; silencing the rest keeps
  // the suite output free of JSON lines that say nothing to a reader.
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Rejection cases answered before the first Prisma call, which keeps the suite
 * running without a database — the same rule the rest of `backend/tests` follows.
 * The assertion that pins it is `statusCode === 400`: a failure that had reached
 * Prisma would not be an `AppError` at all.
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
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("resetKeys", () => {
  it("rejects a key that is not in the catalog", async () => {
    const error = await rejection(resetKeys(["health.retiredKey"], "admin@radio"));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("health.retiredKey");
  });
});

describe("hydrateSettings", () => {
  // The happy half first, and it is what makes the failing half meaningful: this
  // is the proof that the mock really does deliver rows into the cache, so the
  // fail-soft assertions below cannot pass on a mock that was never wired up.
  it("loads the stored rows into the cache", async () => {
    findMany.mockResolvedValue([row]);

    await hydrateSettings();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(currentRows().size).toBe(1);
    expect(getSetting("health.emailEnabled")).toBe(false);
    expect(settingSource("health.emailEnabled")).toBe("panel");
  });

  // Fail-soft is the only reason a station with a dead database still boots, so
  // the rejection must not escape. Removing the try/catch fails this test.
  it("resolves instead of rejecting when the database does not answer", async () => {
    findMany.mockRejectedValue(new Error("database is locked"));

    await expect(hydrateSettings()).resolves.toBeUndefined();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("leaves the cache clean when the hydration fails", async () => {
    findMany.mockRejectedValue(new Error("database is locked"));

    await hydrateSettings();

    // Nothing half-landed. A reader has to be able to trust that an empty cache
    // means "nothing was stored", not "the read was interrupted halfway".
    expect(currentRows().size).toBe(0);
    // And what it reads afterwards is the catalog default, not a partial value.
    expect(getSetting("health.emailEnabled")).toBe(true);
    expect(settingSource("health.emailEnabled")).toBe("default");
  });

  // Swallowing without reporting would leave a station silently running on
  // environment values that nobody chose.
  it("reports the failure in the log instead of swallowing it silently", async () => {
    findMany.mockRejectedValue(new Error("database is locked"));

    await hydrateSettings();

    expect(logged.join("\n")).toContain(
      "Hydration failed; running on environment values"
    );
  });

  it("logs nothing about a failure when the hydration succeeds", async () => {
    findMany.mockResolvedValue([row]);

    await hydrateSettings();

    expect(logged.join("\n")).not.toContain("Hydration failed");
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
