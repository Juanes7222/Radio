import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  PUBLIC_ENDPOINTS,
  cacheTagFor,
  hostForVu,
  forwardedIpForVu,
} = await import("../lib/endpoints.js");

describe("PUBLIC_ENDPOINTS", () => {
  it("lists exactly the eight cheap reads with fixed cache keys", () => {
    assert.deepEqual(
      PUBLIC_ENDPOINTS.map((entry) => entry.path),
      [
        "/api/nowplaying",
        "/api/schedule?start=2026-11-01&end=2026-11-08",
        "/api/bible/reading/today",
        "/api/bible/translations",
        "/api/bible/books?translation=RVR1960",
        "/api/health/public",
        "/health",
        "/api/bible/search?q=dios",
      ]
    );
  });

  it("gives every entry a name and an expected status", () => {
    for (const entry of PUBLIC_ENDPOINTS) {
      assert.equal(typeof entry.name, "string");
      assert.ok(entry.name.length > 0);
      assert.equal(entry.expectedStatus, 200);
    }
  });

  it("excludes expensive or separately limited surfaces", () => {
    const paths = PUBLIC_ENDPOINTS.map((entry) => entry.path).join(" ");
    assert.doesNotMatch(paths, /schedule\/categories|\/api\/search\b|\/art\/|\/live-status/);
  });
});

describe("cacheTagFor", () => {
  it("splits nowplaying and schedule into cold and warm bursts", () => {
    assert.equal(cacheTagFor("/api/nowplaying", 0), "cold");
    assert.equal(cacheTagFor("/api/nowplaying", 1), "warm");
    assert.equal(cacheTagFor("/api/schedule", 0), "cold");
    assert.equal(cacheTagFor("/api/schedule", 1), "warm");
  });

  it("does not invent a cold and warm split for other routes", () => {
    assert.equal(cacheTagFor("/api/bible/translations", 0), "none");
    assert.equal(cacheTagFor("/health", 1), "none");
  });
});

describe("per-VU identities", () => {
  it("provides at least twenty distinct hosts", () => {
    const hosts = new Set(Array.from({ length: 20 }, (_, index) => hostForVu(index + 1)));
    assert.equal(hosts.size, 20);
  });

  it("gives the same VU the same identity and distinct VUs distinct IPs", () => {
    assert.equal(hostForVu(3), hostForVu(3));
    const ips = new Set(Array.from({ length: 20 }, (_, index) => forwardedIpForVu(index + 1)));
    assert.equal(ips.size, 20);
  });
});
