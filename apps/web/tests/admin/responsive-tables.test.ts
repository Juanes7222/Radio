import { describe, expect, it } from "vitest";
import { read } from "./files";

const TABLE_PAGES = [
  "src/pages/admin/AdminPlaybackHistory.tsx",
  "src/pages/admin/AdminReadingHistory.tsx",
  "src/pages/admin/AdminSettings.tsx",
  "src/pages/admin/AdminUsers.tsx",
  "src/pages/admin/AdminYouTube.tsx",
  "src/pages/admin/devices/DeviceRegistrySection.tsx",
  "src/pages/admin/devices/PushNotificationSection.tsx",
  "src/pages/admin/devices/ZoneRecalcSection.tsx",
  "src/pages/admin/locutor/AudioBank.tsx",
];

describe("responsive admin tables", () => {
  it("provides a labelled, keyboard-scrollable table region", () => {
    const source = read("src/components/admin/ResponsiveTable.tsx");

    expect(source).toContain('role="region"');
    expect(source).toContain("tabIndex={0}");
    expect(source).toContain("aria-label");
    expect(source).toContain("--label-");
  });

  it("keeps headers sticky and stacks into labelled cards in a container query", () => {
    const css = read("src/index.css");

    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("@container (width < 600px)");
    expect(css).toContain(".responsive-table thead");
    expect(css).toContain("position: sticky");
    expect(css).toContain("content: var(--label-");
  });

  it("uses the primitive in every admin data table", () => {
    for (const path of TABLE_PAGES) {
      expect(read(path), path).toContain("ResponsiveTable");
    }
  });
});
