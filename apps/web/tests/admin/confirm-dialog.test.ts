import { describe, expect, it } from "vitest";
import { adminPages, read } from "./files";

describe("admin delete confirmations", () => {
  it("does not use the browser's native confirm() in any admin page", () => {
    for (const path of adminPages()) {
      expect(read(path), path).not.toMatch(/(^|[^\w.])confirm\s*\(/m);
    }
  });

  it("confirms category deletion through the shared dialog", () => {
    const page = read("src/pages/admin/AdminScheduleCategories.tsx");

    expect(page).toContain("ConfirmDialog");
    expect(page).toContain("onConfirm");
  });

  it("names the dialog and leaves the safe action focused", () => {
    const dialog = read("src/components/ui-custom/ConfirmDialog.tsx");

    expect(dialog).toContain("AlertDialogTitle");
    expect(dialog).toContain("AlertDialogDescription");
    expect(dialog).toContain("AlertDialogCancel");
    expect(dialog).toContain("autoFocus");
    expect(dialog).toContain("AlertDialogAction");
  });
});
