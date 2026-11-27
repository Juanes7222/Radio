import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { SEARCH_ENDPOINT, SEARCH_NOTE } = await import("../lib/endpoints.js");

describe("search isolation", () => {
  it("uses the real /api/search query parameter with a fixed cache key", () => {
    assert.equal(SEARCH_ENDPOINT, "/api/search?search=radio&per_page=10");
  });

  it("states in the report that the number is not mixed with cheap reads", () => {
    assert.match(SEARCH_NOTE, /not mixed/i);
  });
});
