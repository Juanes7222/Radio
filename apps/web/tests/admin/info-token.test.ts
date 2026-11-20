import { describe, expect, it } from "vitest";
import { read } from "./files";

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from index.css`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`${selector} has no closing brace`);
}

describe("admin informational token", () => {
  it("uses a saturated colour instead of the muted parchment", () => {
    const adminTheme = block(read("src/index.css"), "  .admin-theme");

    expect(adminTheme).toContain("--info: 199 85% 62%;");
    expect(adminTheme).not.toContain("--info: 44 24% 62%;");
  });
});
