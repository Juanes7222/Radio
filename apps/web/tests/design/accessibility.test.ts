import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = join(webRoot, "src");

function read(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

function relativeToWeb(file: string): string {
  return file.slice(webRoot.length + 1).replace(/\\/g, "/");
}

describe("web accessibility", () => {
  it("declares the document language and keeps pinch zoom available", () => {
    const html = read("index.html");

    expect(html).toContain('<html lang="es"');

    const viewport = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(viewport).toContain("user-scalable=yes");
    // Locking the scale is the usual way a layout hides that it does not fit.
    const maximumScale = Number(/maximum-scale=([\d.]+)/.exec(viewport)?.[1] ?? "0");
    expect(maximumScale).toBeGreaterThanOrEqual(2);
  });

  it("gives every image alternative text", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(srcRoot)) {
      const source = readFileSync(file, "utf8");
      const images = /<img\b[\s\S]{0,1200}?>/g;
      for (const match of source.matchAll(images)) {
        if (/\balt\s*=/.test(match[0])) continue;
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${relativeToWeb(file)}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps a visible focus ring on the custom interactive classes", () => {
    // These are plain anchors and buttons styled in index.css, so nothing from
    // the component library supplies their focus state. A new one without a
    // focus-visible rule is a keyboard dead end.
    const css = read("src/index.css");

    for (const selector of [
      ".header-nav__link:focus-visible",
      ".header-actions__item:focus-visible",
      ".nav-row:focus-visible",
      ".nav-legal-link:focus-visible",
      ".nav-drawer__close:focus-visible",
    ]) {
      expect(css, `${selector} is missing a focus style`).toContain(selector);
    }
  });
});
