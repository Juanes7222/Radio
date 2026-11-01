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
  const source = parse(file);
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

/**
 * The modules a test file replaces with `vi.mock`.
 *
 * Vitest answers those from the mock registry instead of loading them, so the
 * edge the static import declares does not exist at runtime. Reading the file
 * that mocks is the only accurate way to tell a module the suite boots from one
 * it substitutes.
 */
function mockedModules(testFile: string): Set<string> {
  const mocked = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isViMock(node)) {
      const [first] = node.arguments;
      if (first !== undefined && ts.isStringLiteral(first)) {
        const target = resolveSpecifier(first.text, testFile);
        if (target !== null) mocked.add(target);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(testFile));
  return mocked;
}

function isViMock(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "vi" &&
    callee.name.text === "mock"
  );
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
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

/**
 * The import edges a single test file really loads, following the static
 * imports and stopping at every module that file mocks.
 *
 * Traversal is per test file because that is how vitest isolates mocks: a module
 * mocked in one file is still booted by another. A shared walk would report a
 * clean suite that one test file alone breaks.
 */
function loadedEdges(testFile: string): Array<{ file: string; specifier: string }> {
  const mocked = mockedModules(testFile);
  const seen = new Set<string>();
  const queue = [testFile];
  const edges: Array<{ file: string; specifier: string }> = [];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);

    for (const specifier of staticImports(file)) {
      const target = resolveSpecifier(specifier, file);
      const isMocked = target !== null && mocked.has(target);
      if (isMocked) continue;

      edges.push({ file, specifier });
      if (target !== null) queue.push(target);
    }
  }

  return edges;
}

/** The modules the suite boots that match, named by the edge that reaches them. */
function offenders(matches: (specifier: string) => boolean): string[] {
  const found = new Set<string>();
  for (const testFile of testFiles()) {
    for (const edge of loadedEdges(testFile)) {
      if (matches(edge.specifier.replace(/\\/g, "/"))) {
        found.add(`${edge.file} -> ${edge.specifier}`);
      }
    }
  }
  return [...found];
}

/**
 * The suite runs pure modules: it never boots Prisma and never talks to
 * AzuraCast. A test that imported the Prisma client would need the generated
 * client, and the generated client only exists after `prisma generate`, so the
 * suite would not be green on a fresh checkout.
 */
describe("the backend suite", () => {
  it("never loads the Prisma client", () => {
    const found = offenders(
      (specifier) =>
        specifier === "@prisma/client" ||
        specifier.endsWith("infrastructure/database/prisma")
    );

    expect(found, "the suite loads the Prisma client").toEqual([]);
  });

  it("never loads the AzuraCast client", () => {
    const found = offenders((specifier) => specifier.endsWith("azuracast/azuracast.client"));

    expect(found, "the suite loads the AzuraCast client").toEqual([]);
  });
});
