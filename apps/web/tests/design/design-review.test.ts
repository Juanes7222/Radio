import { describe, expect, it } from "vitest";
import {
  evaluateAddedLines,
  evaluateImages,
  isTokenFile,
} from "../../../../scripts/design-review/rules.ts";
import { parseUnifiedDiff } from "../../../../scripts/design-review/diff.ts";

const ADMIN_PAGE = "apps/web/src/pages/admin/AdminExample.tsx";
const PUBLIC_PAGE = "apps/web/src/pages/ExamplePage.tsx";
const MOBILE_SCREEN = "apps/mobile/app/example.tsx";

function findingsFor(path: string, text: string) {
  return evaluateAddedLines(path, [{ line: 1, text }]);
}

describe("design review rules", () => {
  it("flags a literal color added to a component", () => {
    const findings = findingsFor(ADMIN_PAGE, "const accent = '#ff0000';");

    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("design/raw-color");
    expect(findings[0].severity).toBe("error");
  });

  it("accepts token utilities and hsl(var(--token)) expressions", () => {
    expect(findingsFor(ADMIN_PAGE, '<div className="bg-primary/10 text-faint" />')).toEqual([]);
    expect(findingsFor(PUBLIC_PAGE, "bg-[radial-gradient(hsl(var(--tally)/0.4),transparent)]")).toEqual([]);
  });

  it("leaves the files that own the tokens alone", () => {
    expect(isTokenFile("apps/mobile/constants/theme.ts")).toBe(true);
    expect(isTokenFile("apps/web/src/index.css")).toBe(true);
    expect(findingsFor("apps/mobile/constants/theme.ts", "signal: '#8D86F4',")).toEqual([]);
    expect(findingsFor("apps/web/src/index.css", "  --primary: 244 83% 74%;")).toEqual([]);
  });

  it("flags an emoji in interface code but not in a comment", () => {
    expect(findingsFor(PUBLIC_PAGE, "<p>Hola 🎵</p>")).toHaveLength(1);
    expect(findingsFor(PUBLIC_PAGE, "// 🎵 this is a note to the next reader")).toEqual([]);
  });

  it("warns about slate utilities only inside the admin panel", () => {
    const admin = findingsFor(ADMIN_PAGE, '<div className="bg-slate-800 text-slate-200" />');
    expect(admin).toHaveLength(1);
    expect(admin[0].rule).toBe("design/slate-utilities");
    expect(admin[0].severity).toBe("warning");

    expect(findingsFor(PUBLIC_PAGE, '<div className="bg-slate-800" />')).toEqual([]);
  });

  it("warns about transition-all on both apps", () => {
    expect(findingsFor(MOBILE_SCREEN, "transition-all duration-150")).toHaveLength(1);
    expect(findingsFor(PUBLIC_PAGE, "transition-colors duration-150")).toEqual([]);
  });

  it("flags an image without alt only when the tag is part of the change", () => {
    const source = '<img src="/a.png" />\n<img src="/b.png" alt="Portada" />';

    const added = evaluateImages(PUBLIC_PAGE, source, new Set([1, 2]));
    expect(added).toHaveLength(1);
    expect(added[0].rule).toBe("design/img-alt");
    expect(added[0].line).toBe(1);

    // Existing markup is not the change's responsibility.
    expect(evaluateImages(PUBLIC_PAGE, source, new Set())).toEqual([]);
  });

  it("ignores non-image files for the alt rule", () => {
    expect(evaluateImages("apps/web/src/lib/urls.ts", "<img src='x' />", new Set([1]))).toEqual([]);
  });
});

describe("design review diff parser", () => {
  it("records the new line number of every added line", () => {
    const patch = [
      "diff --git a/apps/web/src/a.tsx b/apps/web/src/a.tsx",
      "--- a/apps/web/src/a.tsx",
      "+++ b/apps/web/src/a.tsx",
      "@@ -3,2 +3,4 @@",
      " const a = 1;",
      "+const b = 2;",
      " const c = 3;",
      "+const d = 4;",
    ].join("\n");

    expect(parseUnifiedDiff(patch)).toEqual([
      {
        path: "apps/web/src/a.tsx",
        addedLines: [
          { line: 4, text: "const b = 2;" },
          { line: 6, text: "const d = 4;" },
        ],
      },
    ]);
  });

  it("skips deleted files and hunks that only remove lines", () => {
    const deleted = [
      "--- a/apps/web/src/old.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-export const gone = 1;",
    ].join("\n");
    const removal = [
      "--- a/apps/web/src/b.ts",
      "+++ b/apps/web/src/b.ts",
      "@@ -1,2 +1 @@",
      "-const a = 1;",
      " const b = 2;",
    ].join("\n");

    expect(parseUnifiedDiff(deleted)).toEqual([]);
    expect(parseUnifiedDiff(removal)).toEqual([]);
  });
});
