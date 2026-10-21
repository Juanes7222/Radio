import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sw = readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8");

describe("service worker navigation cache", () => {
  it("only stores the home page under /index.html", () => {
    const lines = sw.split("\n");
    const indexWrite = lines.findIndex((line) => line.includes("cache.put('/index.html'"));
    expect(indexWrite).toBeGreaterThan(-1);
    const guard = lines.slice(Math.max(0, indexWrite - 8), indexWrite).join("\n");
    expect(guard).toMatch(/url\s*===\s*['"]\/['"]|pathname\s*===\s*['"]\/['"]/);
  });
});
