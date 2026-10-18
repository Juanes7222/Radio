import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

const indexSource = readFileSync(join(srcRoot, "index.ts"), "utf8");

/**
 * A source test, because the boot sequence is imperative: importing `index.ts`
 * would start the process, and the order under test is the one the scheduler
 * actually sees.
 *
 * The scheduler registers jobs that read settings at registration time. A job
 * registered before hydration would decide using catalog defaults, so a setting
 * saved in the panel would silently not apply on the first cycle after a deploy.
 */
describe("settings boot order", () => {
  it("hydrates the settings cache before the scheduler starts", () => {
    const hydrate = indexSource.indexOf("hydrateSettings(");
    const scheduler = indexSource.indexOf("startScheduler(");

    expect(hydrate).toBeGreaterThan(-1);
    expect(scheduler).toBeGreaterThan(hydrate);
  });

  it("awaits the hydration, so the scheduler cannot race it", () => {
    expect(/await\s+hydrateSettings\(\)/.test(indexSource)).toBe(true);
  });
});
