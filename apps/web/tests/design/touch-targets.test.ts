import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("web touch targets", () => {
  const css = read("src/index.css");

  it("keeps a 44px floor for every button on the listener site", () => {
    expect(css).toMatch(
      /button,\s*\[role="button"\] \{\s*min-height: 44px;\s*min-width: 44px;\s*\}/,
    );
  });

  it("lets the admin console size its own controls", () => {
    // The panel is pointer/keyboard-first. Without this reset every dense
    // toolbar button would be forced to 44px and the console tables would
    // stretch. Removing it is a visual regression across the whole panel.
    expect(css).toMatch(
      /\.admin-theme button,\s*\.admin-theme \[role='button'\] \{\s*min-height: 0;\s*min-width: 0;\s*\}/,
    );
  });
});
