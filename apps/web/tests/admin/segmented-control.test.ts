import { describe, expect, it } from "vitest";
import { read } from "./files";

const SEGMENTED_PAGES = [
  "src/pages/admin/AdminPlaybackHistory.tsx",
  "src/pages/admin/AdminUpload.tsx",
];

describe("admin segmented control", () => {
  it("uses tab semantics with roving focus instead of aria-pressed", () => {
    const source = read("src/components/admin/SegmentedControl.tsx");

    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain("aria-selected");
    expect(source).toContain("tabIndex");
    expect(source).toContain("ArrowRight");
    expect(source).not.toContain("aria-pressed");
  });

  it("paints selection with an underline, not colour alone", () => {
    const css = read("src/index.css");

    expect(css).toContain(".segmented-control");
    expect(css).toContain('[aria-selected="true"]');
    expect(css).toContain("border-block-end");
  });

  it("replaces the ad-hoc switches in playback history and upload mode", () => {
    for (const path of SEGMENTED_PAGES) {
      const source = read(path);

      expect(source, path).toContain("SegmentedControl");
      expect(source, path).not.toContain("aria-pressed");
    }
  });
});
