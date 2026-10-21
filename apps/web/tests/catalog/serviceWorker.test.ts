import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const swPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "sw.js",
);

const source = ts.createSourceFile(
  "sw.js",
  readFileSync(swPath, "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);

/** The call that stores a navigation under /index.html. */
function isIndexWrite(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "put" &&
    node.arguments.length > 0 &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === "/index.html"
  );
}

/** What the file declares, by name, to resolve a guard that is a variable. */
const declarations = new Map<string, string>();

function collectDeclarations(node: ts.Node): void {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer !== undefined
  ) {
    declarations.set(node.name.text, node.initializer.getText(source));
  }
  ts.forEachChild(node, collectDeclarations);
}

collectDeclarations(source);

interface IndexWrite {
  /**
   * The conditions that have to hold for the write to run, outermost first.
   *
   * The body of an `if`, the right side of a `&&` and the two arms of a
   * ternary add a condition; the test of an `if` does not. The old check read
   * the lines around the write, which found the declaration of the flag
   * whether the write used it or not.
   */
  readonly conditions: readonly string[];
}

function findIndexWrites(): IndexWrite[] {
  const found: IndexWrite[] = [];

  const walk = (node: ts.Node, conditions: readonly string[]): void => {
    if (isIndexWrite(node)) {
      found.push({ conditions });
      return;
    }

    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText(source);
      walk(node.expression, conditions);
      walk(node.thenStatement, [...conditions, condition]);
      if (node.elseStatement !== undefined) {
        walk(node.elseStatement, [...conditions, `!(${condition})`]);
      }
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      walk(node.left, conditions);
      walk(node.right, [...conditions, node.left.getText(source)]);
      return;
    }

    if (ts.isConditionalExpression(node)) {
      const condition = node.condition.getText(source);
      walk(node.condition, conditions);
      walk(node.whenTrue, [...conditions, condition]);
      walk(node.whenFalse, [...conditions, condition]);
      return;
    }

    ts.forEachChild(node, (child) => walk(child, conditions));
  };

  walk(source, []);
  return found;
}

/** The condition has to compare the path of the request with the root. */
const ROOT_COMPARISON = /(?:pathname|url)\s*===\s*['"]\/['"]/;

/**
 * Whether a condition holds only for the home page.
 *
 * The condition can be the comparison itself ("url.pathname === '/'") or a
 * variable that holds it ("isRoot"). A negated flag does not count: "!isRoot"
 * is true for every page that is not the home page.
 */
function mentionsRoot(condition: string): boolean {
  const text = condition.trim();
  if (ROOT_COMPARISON.test(text)) return true;
  if (text.startsWith("!")) return false;
  const declaration = declarations.get(text);
  return declaration !== undefined && ROOT_COMPARISON.test(declaration);
}

describe("service worker navigation cache", () => {
  it("only stores the home page under /index.html", () => {
    const writes = findIndexWrites();

    expect(writes.length).toBe(1);

    // The write has to be guarded by the path of the request: a navigation to
    // a catalog page would otherwise replace the cached home page and the
    // offline fallback would serve the wrong document.
    const conditions = writes[0]?.conditions ?? [];
    expect(
      conditions.some(mentionsRoot),
      "the write to /index.html is not guarded by the root path",
    ).toBe(true);
  });
});
