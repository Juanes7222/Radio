import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = join(webRoot, "src");

interface ImportRule {
  specifier: string;
  allowedPrefixes: string[];
  reason: string;
}

interface Violation {
  file: string;
  specifier: string;
}

// Heavy dependencies that must not leak into the public first paint.
// - firebase is only needed by the admin login.
// - recharts is only used by the admin dashboard chart wrapper.
// - react-day-picker is only used by the (currently unused) shadcn calendar.
// embla-carousel is intentionally absent: the public notice carousel uses it.
const RULES: ImportRule[] = [
  {
    specifier: "firebase/app",
    allowedPrefixes: ["src/lib/firebase.ts", "src/pages/admin/"],
    reason: "firebase/app must stay in the admin login path",
  },
  {
    specifier: "firebase/auth",
    allowedPrefixes: ["src/lib/firebase.ts", "src/pages/admin/"],
    reason: "firebase/auth must stay in the admin login path",
  },
  {
    specifier: "firebase",
    allowedPrefixes: ["src/lib/firebase.ts", "src/pages/admin/"],
    reason: "firebase must stay in the admin login path",
  },
  {
    specifier: "recharts",
    allowedPrefixes: ["src/components/ui/chart.tsx", "src/pages/admin/"],
    reason: "recharts must stay in the admin dashboard path",
  },
  {
    specifier: "react-day-picker",
    allowedPrefixes: ["src/components/ui/calendar.tsx"],
    reason: "react-day-picker must stay in the calendar wrapper",
  },
];

const IMPORT_PATTERN = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function specifiersInFile(file: string): string[] {
  const content = readFileSync(file, "utf8");
  const found: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_PATTERN.lastIndex = 0;
  while ((match = IMPORT_PATTERN.exec(content)) !== null) {
    const specifier = match[1] ?? match[2];
    if (specifier) found.push(specifier);
  }
  return found;
}

function toPosixRelative(file: string): string {
  return relative(webRoot, file).split(sep).join("/");
}

function isAllowed(relativeFile: string, rule: ImportRule): boolean {
  return rule.allowedPrefixes.some((prefix) => relativeFile.startsWith(prefix));
}

function matchesSpecifier(importSpecifier: string, rule: ImportRule): boolean {
  return (
    importSpecifier === rule.specifier ||
    importSpecifier.startsWith(`${rule.specifier}/`)
  );
}

function collectViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const file of listSourceFiles(srcRoot)) {
    const relativeFile = toPosixRelative(file);
    for (const specifier of specifiersInFile(file)) {
      for (const rule of RULES) {
        if (matchesSpecifier(specifier, rule) && !isAllowed(relativeFile, rule)) {
          violations.push({ file: relativeFile, specifier });
        }
      }
    }
  }
  return violations;
}

describe("import boundaries", () => {
  it("keeps heavy admin-only dependencies out of the public path", () => {
    const violations = collectViolations();
    expect(
      violations
        .map((v) => `${v.file} imports ${v.specifier}`)
        .join("\n"),
      RULES.map((r) => `${r.specifier}: ${r.reason}`).join("; "),
    ).toBe("");
  });
});
