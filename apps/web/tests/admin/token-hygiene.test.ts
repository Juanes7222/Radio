import { describe, expect, it } from "vitest";
import { adminPages, read } from "./files";

describe("admin token hygiene", () => {
  it("keeps slate utilities out of every admin component", () => {
    for (const path of adminPages()) {
      expect(read(path), path).not.toMatch(/\b(?:bg|text|border|ring|from|to|via)-slate-\d+/);
    }
  });
});
