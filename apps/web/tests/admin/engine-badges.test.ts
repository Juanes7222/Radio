import { describe, expect, it } from "vitest";
import { read } from "./files";

describe("locutor engine badges", () => {
  it("paints Kokoro with the same fallback warning token as the engine lamp", () => {
    const bank = read("src/pages/admin/locutor/AudioBank.tsx");
    const dashboard = read("src/pages/admin/locutor/StatusDashboard.tsx");
    const kokoro = bank.match(/kokoro: \{[^\n]+\}/)?.[0] ?? "";

    expect(dashboard).toContain("bg-warning");
    expect(kokoro).toContain("warning");
    expect(kokoro).not.toContain("info");
  });
});
