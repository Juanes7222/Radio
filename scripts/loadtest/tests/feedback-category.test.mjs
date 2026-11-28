import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { readFeedbackCategory } = await import("../lib/feedback-category.mjs");

describe("readFeedbackCategory", () => {
  it("reads SUGERENCIA from the shared type source", () => {
    assert.equal(readFeedbackCategory("SUGERENCIA"), "SUGERENCIA");
  });

  it("fails closed for an unknown category", () => {
    assert.throws(() => readFeedbackCategory("INEXISTENTE"), /not found/);
  });
});
