import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const settingsDir = join(srcRoot, "pages", "admin", "settings");

/**
 * Every source of the settings form. The fields live in the extracted
 * `SettingsSectionCard.tsx`, so an assertion pointed at the page container
 * would watch a file that draws nothing: a hardcoded field list in the card, or
 * a deleted restart notice, would both pass.
 */
function readFormSources(): string {
  return readdirSync(settingsDir)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => readFileSync(join(settingsDir, name), "utf8"))
    .join("\n");
}

describe("settings panel entry", () => {
  it("registers /admin/settings under the settings permission", () => {
    const layout = readFileSync(join(srcRoot, "pages", "admin", "AdminLayout.tsx"), "utf8");
    const entry = /to:\s*'\/admin\/settings'[\s\S]{0,200}?permission:\s*'settings'/.exec(layout);

    expect(entry).not.toBeNull();
  });

  it("surfaces the restart requirement instead of hiding it", () => {
    // The notice has to be on the field, before the operator saves, not only in
    // the sentence that reports a save afterwards. `aria-live` is what pins the
    // rendered notice and not just the flag: the card reads `requiresRestart`
    // elsewhere too, so a deleted paragraph would survive a lone `toContain`.
    const form = readFormSources();

    expect(form).toContain("requiresRestart");
    expect(form).toContain("aria-live");
  });

  it("does not offer an input for a setting that is not in the catalog", () => {
    // The form is driven by the response, so a hardcoded field list would be a
    // second source of truth that drifts from the backend.
    expect(readFormSources()).not.toMatch(/HEALTH_[A-Z_]+/);
  });
});