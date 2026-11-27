import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const ENV_KEYS = ["K6_PATH", "K6_BASE_URL", "K6_ORIGIN_URL"];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe("loadConfig", () => {
  it("validates only the selected path and defaults to edge", async () => {
    process.env.K6_PATH = "edge";
    process.env.K6_BASE_URL = "https://lavozverdad.com";
    delete process.env.K6_ORIGIN_URL;
    const { loadConfig } = await import("../config.js");

    assert.deepEqual(loadConfig(), {
      baseUrl: "https://lavozverdad.com",
      originUrl: "",
      path: "edge",
    });
  });

  it("works in origin mode with only K6_ORIGIN_URL defined", async () => {
    process.env.K6_PATH = "origin";
    delete process.env.K6_BASE_URL;
    process.env.K6_ORIGIN_URL = "http://203.0.113.10:3001";
    const { loadConfig } = await import("../config.js");

    assert.deepEqual(loadConfig(), {
      baseUrl: "",
      originUrl: "http://203.0.113.10:3001",
      path: "origin",
    });
  });

  it("rejects loopback addresses in origin mode", async () => {
    process.env.K6_PATH = "origin";
    process.env.K6_ORIGIN_URL = "http://127.0.0.1:3000";
    const { loadConfig } = await import("../config.js");

    assert.throws(() => loadConfig(), /K6_ORIGIN_URL/);
  });

  it("names the missing variable in the error", async () => {
    process.env.K6_PATH = "edge";
    delete process.env.K6_BASE_URL;
    const { loadConfig } = await import("../config.js");

    assert.throws(() => loadConfig(), /K6_BASE_URL/);
  });

  it("rejects an unknown path", async () => {
    process.env.K6_PATH = "tunnel";
    process.env.K6_BASE_URL = "https://lavozverdad.com";
    const { loadConfig } = await import("../config.js");

    assert.throws(() => loadConfig(), /K6_PATH/);
  });
});
