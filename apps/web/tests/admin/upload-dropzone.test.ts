import { describe, expect, it } from "vitest";
import { read } from "./files";

describe("admin upload dropzone", () => {
  it("has a keyboard-operable trigger and visually hidden file inputs", () => {
    const source = read("src/pages/admin/AdminUpload.tsx");

    expect(source).toContain('role="button"');
    expect(source).toContain("tabIndex={0}");
    expect(source).toContain("onKeyDown");
    expect(source).toContain('className="sr-only"');
    expect(source).not.toMatch(/type="file"[^>]*className="hidden"/);
  });
});
