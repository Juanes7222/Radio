import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const BACKEND_ROOT = resolve(__dirname, "..", "..");
const TESTS_ROOT = join(BACKEND_ROOT, "tests");

/** Every TypeScript file of the suite. */
function testFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(TESTS_ROOT);
  return files;
}

/**
 * The specifiers of the static imports of a file.
 *
 * A dynamic import is not a boot: the module is only loaded when the function
 * that asks for it runs, and the suite never calls those functions. A static
 * import, on the other hand, loads the module when the suite loads it.
 */
function staticImports(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/** The file a relative specifier points at, when there is one. */
function resolveSpecifier(specifier: string, from: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file the suite loads, following the static imports from the tests. */
function reachableFiles(): string[] {
  const seen = new Set<string>();
  const queue = testFiles();
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const specifier of staticImports(file)) {
      const target = resolveSpecifier(specifier, file);
      if (target !== null) queue.push(target);
    }
  }
  return [...seen];
}

/**
 * The suite runs pure modules: it never boots Prisma and never talks to
 * AzuraCast. A test that imported the Prisma client would need the generated
 * client, and the generated client only exists after `prisma generate`, so the
 * suite would not be green on a fresh checkout.
 */
describe("the backend suite", () => {
  it("never loads the Prisma client", () => {
    const offenders: string[] = [];
    for (const file of reachableFiles()) {
      for (const specifier of staticImports(file)) {
        if (
          specifier === "@prisma/client" ||
          specifier.replace(/\\/g, "/").endsWith("infrastructure/database/prisma")
        ) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(offenders, "the suite loads the Prisma client").toEqual([]);
  });

  it("never loads the AzuraCast client", () => {
    const offenders: string[] = [];
    for (const file of reachableFiles()) {
      for (const specifier of staticImports(file)) {
        if (specifier.replace(/\\/g, "/").endsWith("azuracast/azuracast.client")) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(offenders, "the suite loads the AzuraCast client").toEqual([]);
  });
});
