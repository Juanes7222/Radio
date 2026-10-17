import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/**
 * The bumpers page reuses the `programs` permission, so the sidebar entry has to
 * carry that same permission: an entry with a different one would hide the page
 * from exactly the admins that manage the programs.
 */
describe("bumpers panel entry", () => {
  it("registers /admin/bumpers under the programs permission", () => {
    const layout = readFileSync(join(srcRoot, "pages", "admin", "AdminLayout.tsx"), "utf8");
    const entry = /to:\s*'\/admin\/bumpers'[\s\S]{0,200}?permission:\s*'programs'/.exec(layout);
    expect(entry).not.toBeNull();
  });
});