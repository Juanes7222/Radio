import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** Reads the custom properties declared directly inside a CSS block. */
function declarationsIn(source: string, selector: string): Map<string, string> {
  const selectorIndex = source.indexOf(`${selector} {`);
  expect(selectorIndex, `${selector} is missing from index.css`).toBeGreaterThanOrEqual(0);

  const open = source.indexOf("{", selectorIndex);
  let depth = 0;
  let close = source.length;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }

  const declarations = new Map<string, string>();
  for (const line of source.slice(open + 1, close).split("\n")) {
    const match = /^\s*(--[a-z-]+):\s*([^;]+);/.exec(line);
    if (match) declarations.set(match[1], match[2].trim());
  }
  return declarations;
}

const PUBLIC_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--radius",
  "--tally",
  "--success",
  "--warning",
  "--info",
  "--faint",
  "--surface-sunken",
] as const;

const ADMIN_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--radius",
  "--surface-sunken",
  "--faint",
  "--success",
  "--warning",
  "--info",
  "--tally",
] as const;

/** Tailwind needs a bare HSL triplet to generate `bg-tally/10`. */
const HSL_TRIPLET = /^\d+(?:\.\d+)? \d+(?:\.\d+)?% \d+(?:\.\d+)?%$/;

const OPACITY_MODIFIER_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--primary",
  "--destructive",
  "--border",
  "--ring",
  "--tally",
  "--success",
  "--warning",
  "--info",
  "--faint",
  "--surface-sunken",
] as const;

describe("web design tokens", () => {
  const css = read("src/index.css");
  const publicTokens = declarationsIn(css, ":root");
  const adminTokens = declarationsIn(css, ".admin-theme");
  const tailwind = read("tailwind.config.js");

  it("declares every public token on :root", () => {
    for (const token of PUBLIC_TOKENS) {
      expect(publicTokens.has(token), `:root is missing ${token}`).toBe(true);
    }
  });

  it("redeclares the full set on .admin-theme so the panel never inherits the public palette", () => {
    // A token the panel does not override silently falls back to the public
    // one, which is how a public indigo ring appears inside the amber console.
    for (const token of ADMIN_TOKENS) {
      expect(adminTokens.has(token), `.admin-theme is missing ${token}`).toBe(true);
    }
  });

  it("keeps the admin identity separate from the public one", () => {
    expect(adminTokens.get("--primary")).not.toBe(publicTokens.get("--primary"));
    expect(adminTokens.get("--radius")).not.toBe(publicTokens.get("--radius"));
  });

  it("keeps every token that takes an opacity modifier as a bare HSL triplet", () => {
    for (const token of OPACITY_MODIFIER_TOKENS) {
      expect(publicTokens.get(token), `:root ${token}`).toMatch(HSL_TRIPLET);
      expect(adminTokens.get(token), `.admin-theme ${token}`).toMatch(HSL_TRIPLET);
    }
  });

  it("maps the semantic scale in tailwind.config.js", () => {
    for (const token of ["faint", "sunken", "success", "warning", "info", "tally", "brand"]) {
      expect(tailwind, `tailwind colors are missing ${token}`).toContain(`${token}:`);
    }
  });

  it("keeps <alpha-value> on every hsl token, which is what makes bg-tally/10 compile", () => {
    // `sunken` and the sidebar scale are deliberately solid: the first is a
    // surface, never a tinted one, and the sidebar colors are not used with
    // opacity modifiers.
    const usages = /hsl\(var\((--[a-z-]+)\)([^)]*)\)/g;
    const missing: string[] = [];

    for (const match of tailwind.matchAll(usages)) {
      const token = match[1];
      const suffix = match[2];
      if (token.startsWith("--sidebar-")) continue;
      if (token === "--surface-sunken") continue;
      if (!suffix.includes("<alpha-value>")) missing.push(token);
    }

    expect(missing).toEqual([]);
  });
});
