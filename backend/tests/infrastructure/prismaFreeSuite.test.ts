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
function parseSource(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function staticImports(source: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
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

/** Explicit Vitest mocks replace the module for imports reached from that test. */
function mockedFiles(file: string, source: ts.SourceFile): Set<string> {
  const mocked = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const { expression, arguments: [moduleId, factory] } = statement.expression;
    if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== "vi" || expression.name.text !== "mock" ||
      !moduleId || !ts.isStringLiteral(moduleId) || !factory ||
      (!ts.isArrowFunction(factory) && !ts.isFunctionExpression(factory))) continue;

    const target = resolveSpecifier(moduleId.text, file);
    if (target) mocked.add(target);
  }
  return mocked;
}

function reachableImports(): Array<{ file: string; specifier: string }> {
  const imports: Array<{ file: string; specifier: string }> = [];
  const parsed = new Map<string, ts.SourceFile>();

  function sourceFor(file: string): ts.SourceFile {
    const existing = parsed.get(file);
    if (existing) return existing;
    const source = parseSource(file);
    parsed.set(file, source);
    return source;
  }

  for (const root of testFiles()) {
    const mocked = mockedFiles(root, sourceFor(root));
    const seen = new Set<string>();
    const queue = [root];

    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || seen.has(file)) continue;
      seen.add(file);
      for (const specifier of staticImports(sourceFor(file))) {
        const target = resolveSpecifier(specifier, file);
        if (target && mocked.has(target)) continue;
        imports.push({ file, specifier });
        if (target) queue.push(target);
      }
    }
  }

  return imports;
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
    for (const { file, specifier } of reachableImports()) {
      if (specifier === "@prisma/client" ||
        specifier.replace(/\\/g, "/").endsWith("infrastructure/database/prisma")) {
        offenders.push(`${file} -> ${specifier}`);
      }
    }

    expect(offenders, "the suite loads the Prisma client").toEqual([]);
  });

  it("never loads the AzuraCast client", () => {
    const offenders: string[] = [];
    for (const { file, specifier } of reachableImports()) {
      if (specifier.replace(/\\/g, "/").endsWith("azuracast/azuracast.client")) {
        offenders.push(`${file} -> ${specifier}`);
      }
    }

    expect(offenders, "the suite loads the AzuraCast client").toEqual([]);
  });
});
