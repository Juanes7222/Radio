import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

describe("settings panel entry", () => {
  it("registers /admin/settings under the settings permission", () => {
    const layout = readFileSync(join(srcRoot, "pages", "admin", "AdminLayout.tsx"), "utf8");
    const entry = /to:\s*'\/admin\/settings'[\s\S]{0,200}?permission:\s*'settings'/.exec(layout);

    expect(entry).not.toBeNull();
  });

  it("surfaces the restart requirement instead of hiding it", () => {
    const page = readFileSync(join(srcRoot, "pages", "admin", "AdminSettings.tsx"), "utf8");

    expect(page).toContain("requiresRestart");
  });

  it("does not offer an input for a setting that is not in the catalog", () => {
    // The form is driven by the response, so a hardcoded field list would be a
    // second source of truth that drifts from the backend.
    const page = readFileSync(join(srcRoot, "pages", "admin", "AdminSettings.tsx"), "utf8");

    expect(page).not.toMatch(/HEALTH_[A-Z_]+/);
  });
});