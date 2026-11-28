import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../scenarios/admin-reads.js", import.meta.url),
  "utf8"
);

describe("admin-reads checks", () => {
  it("does not claim authorization when the check also accepts a 429", () => {
    assert.doesNotMatch(source, /is authorized/);
    assert.match(source, /response is credible/);
  });

  it("keeps 401 and 403 as explicit failures", () => {
    assert.match(source, /is not an auth failure/);
  });
});
