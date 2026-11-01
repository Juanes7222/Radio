import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("web motion", () => {
  it("honours prefers-reduced-motion for animations and transitions", () => {
    const css = read("src/index.css");

    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{[^}]*animation-duration: 0\.01ms !important;/,
    );
    // The transition override keeps color and opacity (they aid comprehension)
    // and drops everything positional.
    expect(css).toMatch(
      /transition-property: opacity, background-color, color, border-color !important;/,
    );
  });

  it("keeps the public page transition entrance-only", () => {
    // An `exit` here needs AnimatePresence mode="wait", and that mounts the
    // incoming page twice and blocks the main thread twice. The full account
    // lives in docs/frontend-context.md.
    const source = read("src/components/layout/PageTransition.tsx");

    expect(source).toMatch(/useReducedMotion/);
    expect(source).not.toMatch(/\bexit\s*=/);
    // Mentioning it in the comment is the point: using it is what regresses.
    expect(source).not.toMatch(/import[^;]*AnimatePresence/);
    expect(source).not.toMatch(/<AnimatePresence/);
  });

  it("stops the notice carousel autoplay when the listener asks for less motion", () => {
    const source = read("src/components/notices/NoticeCarousel.tsx");

    expect(source).toContain("prefers-reduced-motion: reduce");
  });
});
