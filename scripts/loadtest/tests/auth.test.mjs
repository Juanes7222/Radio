import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const KEYS = ["K6_ADMIN_TOKEN", "K6_WORKER_SECRET", "K6_PANEL_SECRET"];
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original[key];
    }
  }
});

describe("auth headers", () => {
  it("builds the three static protocol headers from secrets only", async () => {
    process.env.K6_ADMIN_TOKEN = "jwt-value";
    process.env.K6_WORKER_SECRET = "worker-value";
    process.env.K6_PANEL_SECRET = "panel-value";
    const { makeAdminHeaders, makeWorkerHeaders, makePanelHeaders } = await import("../lib/auth.js");

    assert.deepEqual(makeAdminHeaders(), { Authorization: "Bearer jwt-value" });
    assert.deepEqual(makeWorkerHeaders(), { "x-worker-secret": "worker-value" });
    assert.deepEqual(makePanelHeaders(), { "x-panel-secret": "panel-value" });
  });

  it("fails closed when a secret is missing", async () => {
    delete process.env.K6_WORKER_SECRET;
    const { makeWorkerHeaders } = await import("../lib/auth.js");

    assert.throws(() => makeWorkerHeaders(), /K6_WORKER_SECRET/);
  });

  it("rejects a blank secret", async () => {
    process.env.K6_ADMIN_TOKEN = "   ";
    const { makeAdminHeaders } = await import("../lib/auth.js");

    assert.throws(() => makeAdminHeaders(), /K6_ADMIN_TOKEN/);
  });
});

describe("secretGuardFailure", () => {
  it("requires the admin token for admin reads", async () => {
    const { secretGuardFailure } = await import("../lib/guards.js");
    delete process.env.K6_ADMIN_TOKEN;

    const failure = secretGuardFailure("admin-reads", process.env);
    assert.equal(failure.code, 4);
    assert.match(failure.message, /K6_ADMIN_TOKEN/);
  });

  it("requires the two protocol secrets for worker reads", async () => {
    const { secretGuardFailure } = await import("../lib/guards.js");
    const env = { K6_WORKER_SECRET: "w" };

    assert.match(secretGuardFailure("worker-reads", env).message, /K6_PANEL_SECRET/);
  });

  it("requires all three secrets for the mixed capacity profile", async () => {
    const { secretGuardFailure } = await import("../lib/guards.js");
    const env = { K6_ADMIN_TOKEN: "a", K6_WORKER_SECRET: "w" };

    assert.match(secretGuardFailure("capacity-mixed", env).message, /K6_PANEL_SECRET/);
  });

  it("does not demand secrets for public profiles", async () => {
    const { secretGuardFailure } = await import("../lib/guards.js");

    assert.equal(secretGuardFailure("public-reads", {}), null);
  });
});
