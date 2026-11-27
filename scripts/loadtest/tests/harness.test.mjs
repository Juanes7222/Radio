import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("withThrottleTag", () => {
  it("marks a 429 as throttled without losing the caller's tags", async () => {
    const { withThrottleTag } = await import("../lib/tags.js");

    assert.deepEqual(
      withThrottleTag({ path: "edge", endpoint: "/health" }, 429),
      { path: "edge", endpoint: "/health", throttled: "yes" }
    );
  });

  it("marks every non-429 response as not throttled", async () => {
    const { withThrottleTag } = await import("../lib/tags.js");

    assert.deepEqual(withThrottleTag({}, 200), { throttled: "no" });
    assert.deepEqual(withThrottleTag({}, 500), { throttled: "no" });
  });
});

describe("DEFAULT_THRESHOLDS", () => {
  it("keeps nginx throttling out of the backend failure rate", async () => {
    const { DEFAULT_THRESHOLDS } = await import("../lib/thresholds.js");

    assert.deepEqual(DEFAULT_THRESHOLDS, {
      http_req_duration: ["p(95) < 1500"],
      http_req_failed: ["rate < 0.01"],
      "http_req_failed{throttled:no}": ["rate < 0.01"],
      checks: ["rate > 0.99"],
    });
  });
});

describe("summarize", () => {
  it("prints the selected path and the k6 metrics as JSON", async () => {
    process.env.K6_PATH = "origin";
    process.env.K6_VUS = "20";
    const { summarize } = await import("../lib/summary.js");
    const originalLog = console.log;
    const lines = [];
    console.log = (line) => lines.push(line);

    try {
      summarize({
        metrics: {
          http_reqs: { values: { count: 500 } },
          http_req_duration: { values: { "p(95)": 123.4 } },
          http_req_failed: { values: { rate: 0.002 } },
          throttled_requests: { values: { count: 7 } },
          checks: { values: { rate: 1 } },
        },
      });
    } finally {
      console.log = originalLog;
      delete process.env.K6_PATH;
      delete process.env.K6_VUS;
    }

    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), {
      path: "origin",
      vus: 20,
      http_reqs: 500,
      "http_req_duration.p95": 123.4,
      http_req_failed: 0.002,
      throttledRequests: 7,
      checks: 1,
    });
  });
});
