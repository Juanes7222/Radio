import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { parseRunArgs, reportFilename } = await import("../lib/cli.js");

describe("parseRunArgs", () => {
  it("parses the profile and every optional flag", () => {
    assert.deepEqual(
      parseRunArgs([
        "capacity",
        "--path",
        "origin",
        "--vus",
        "10",
        "--duration",
        "2m",
        "--instances",
        "2",
        "--vus-max",
        "1600",
      ]),
      {
        profile: "capacity",
        path: "origin",
        vus: 10,
        duration: "2m",
        instances: 2,
        vusMax: 1600,
      }
    );
  });

  it("leaves omitted flags undefined so environment defaults apply", () => {
    assert.deepEqual(parseRunArgs(["smoke"]), {
      profile: "smoke",
      path: undefined,
      vus: undefined,
      duration: undefined,
      instances: undefined,
      vusMax: undefined,
    });
  });

  it("rejects an unknown profile", () => {
    assert.throws(() => parseRunArgs(["unknown"]), /Unknown profile/);
  });

  it("rejects a path other than edge or origin", () => {
    assert.throws(() => parseRunArgs(["smoke", "--path", "tunnel"]), /--path/);
  });

  it("rejects a non-numeric instance count", () => {
    assert.throws(() => parseRunArgs(["smoke", "--instances", "many"]), /--instances/);
  });

  it("rejects a flag without a value", () => {
    assert.throws(() => parseRunArgs(["smoke", "--duration"]), /--duration/);
  });
});

describe("reportFilename", () => {
  it("names the path, instance and timestamp in the JSON report", () => {
    assert.equal(
      reportFilename("public-reads", "origin", 1, "20261126T120000"),
      "reports/public-reads-origin-i1-20261126T120000.json"
    );
  });
});
