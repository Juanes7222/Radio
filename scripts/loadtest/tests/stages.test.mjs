import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { buildStages, stageKindFor, GRACEFUL_RAMP_DOWN } = await import("../lib/stages.js");
const { buildEndpointThresholds } = await import("../lib/thresholds.js");

describe("buildStages", () => {
  it("uses the agreed standard ladder", () => {
    const stages = buildStages("standard");
    assert.deepEqual(stages, [
      { duration: "30s", target: 10 },
      { duration: "2m", target: 25 },
      { duration: "2m", target: 50 },
      { duration: "2m", target: 100 },
      { duration: "2m", target: 200 },
      { duration: "2m", target: 400 },
      { duration: "2m", target: 800 },
      { duration: "30s", target: 0 },
    ]);
  });

  it("doubles every target for the max ladder", () => {
    const stages = buildStages("max");
    assert.deepEqual(
      stages.map((stage) => stage.target),
      [20, 50, 100, 200, 400, 800, 1600, 0]
    );
  });

  it("divides targets across instances", () => {
    assert.deepEqual(buildStages("max", 2), buildStages("standard"));
  });

  it("keeps the ramp-down guard", () => {
    assert.equal(GRACEFUL_RAMP_DOWN, "10s");
  });
});

describe("stageKindFor", () => {
  it("only enables the max ladder above 800 VUs", () => {
    assert.equal(stageKindFor(800), "standard");
    assert.equal(stageKindFor(1600), "max");
  });
});

describe("buildEndpointThresholds", () => {
  it("creates one explicit sub-metric per endpoint because k6 has no wildcards", () => {
    const thresholds = buildEndpointThresholds([
      { name: "nowplaying", path: "/api/nowplaying" },
      { name: "schedule", path: "/api/schedule" },
    ]);

    assert.deepEqual(thresholds, {
      "http_req_duration{endpoint:/api/nowplaying}": ["p(95)<2000"],
      "http_req_duration{endpoint:/api/schedule}": ["p(95)<2000"],
    });
  });

  it("generates keys that the scenario tags actually emit", async () => {
    const { PUBLIC_ENDPOINTS, endpointTags } = await import("../lib/endpoints.js");
    const thresholds = buildEndpointThresholds(PUBLIC_ENDPOINTS);

    for (const endpoint of PUBLIC_ENDPOINTS) {
      const tags = endpointTags(endpoint);
      assert.ok(`http_req_duration{endpoint:${tags.endpoint}}` in thresholds);
      assert.equal(tags.name, endpoint.name);
    }
  });
});
