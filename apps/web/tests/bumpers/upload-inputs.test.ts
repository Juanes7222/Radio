import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const pagePath = join(srcRoot, "pages", "admin", "AdminBumpers.tsx");

/**
 * The rows are rendered from a list, so a React ref declared once at component
 * level resolves to the *last* mounted input. One shared ref per side meant that
 * clicking "Subir intro" on the first row opened the second row's file input, and
 * the intro of one program silently replaced the intro of another. The lookup has
 * to be keyed by bumper id.
 */
describe("AdminBumpers file inputs", () => {
  it("keys each row's file inputs by bumper id instead of sharing one ref per side", () => {
    const page = readFileSync(pagePath, "utf8");

    expect(page).not.toMatch(/const (introInput|outroInput) = useRef/);
    expect(page).toMatch(/useRef<Record<string, HTMLInputElement \| null>>/);
  });
});