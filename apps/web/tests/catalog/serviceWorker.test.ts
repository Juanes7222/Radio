import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const swPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "sw.js",
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

/** A comparison of the path of the request with the root. */
function isRootComparison(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  const operator = node.operatorToken.kind;
  if (
    operator !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    operator !== ts.SyntaxKind.EqualsEqualsToken
  ) {
    return false;
  }
  if (!ts.isStringLiteral(node.right) || node.right.text !== "/") return false;
  const left = node.left.getText();
  return left.includes("pathname") || left.includes("url");
}

/**
 * A condition that has to hold for a statement to run.
 *
 * `negated` says that the condition holds when the expression does not: the
 * else branch of an `if` and the right side of a `||` are the cases where it
 * is the other way around.
 */
interface Condition {
  readonly node: ts.Node;
  readonly negated: boolean;
}

interface IndexWrite {
  /** The conditions that have to hold for the write to run, outermost first. */
  readonly conditions: readonly Condition[];
}

interface Analysis {
  /** The writes under /index.html and the conditions that guard them. */
  readonly writes: readonly IndexWrite[];
  /** Whether a write can only happen on the home page. */
  readonly restrictedToRoot: (write: IndexWrite) => boolean;
}

/**
 * Parses a service worker and reports what guards the writes under
 * /index.html.
 */
function analyzeSource(code: string): Analysis {
  const source = ts.createSourceFile(
    "sw.js",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  /** What the file declares, by name, to resolve a guard that is a variable. */
  const declarations = new Map<string, ts.Expression>();

  const collectDeclarations = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      declarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectDeclarations);
  };
  collectDeclarations(source);

  const writes: IndexWrite[] = [];

  const walk = (node: ts.Node, conditions: readonly Condition[]): void => {
    if (isIndexWrite(node)) {
      writes.push({ conditions });
      return;
    }

    if (ts.isIfStatement(node)) {
      const condition: Condition = { node: node.expression, negated: false };
      walk(node.expression, conditions);
      walk(node.thenStatement, [...conditions, condition]);
      if (node.elseStatement !== undefined) {
        walk(node.elseStatement, [...conditions, { ...condition, negated: true }]);
      }
      return;
    }

    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        // The right side runs only when the left one holds.
        walk(node.left, conditions);
        walk(node.right, [...conditions, { node: node.left, negated: false }]);
        return;
      }
      if (operator === ts.SyntaxKind.BarBarToken) {
        // The right side runs when the left one does NOT hold, so it does not
        // inherit it as a guard.
        walk(node.left, conditions);
        walk(node.right, [...conditions, { node: node.left, negated: true }]);
        return;
      }
    }

    if (ts.isConditionalExpression(node)) {
      const condition: Condition = { node: node.condition, negated: false };
      walk(node.condition, conditions);
      walk(node.whenTrue, [...conditions, condition]);
      walk(node.whenFalse, [...conditions, { ...condition, negated: true }]);
      return;
    }

    ts.forEachChild(node, (child) => walk(child, conditions));
  };

  walk(source, []);

  /**
   * Whether a condition can only be true on the home page.
   *
   * A comparison of the path with the root says so; a flag that holds it says
   * so too. A conjunction holds when both sides hold, so one of them is
   * enough; a disjunction holds when one of them holds, so both have to be.
   * The negation of a root check is true for every page that is not the home
   * page, so it says nothing.
   */
  const impliesRoot = (node: ts.Node, negated: boolean): boolean => {
    if (ts.isParenthesizedExpression(node)) {
      return impliesRoot(node.expression, negated);
    }
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken
    ) {
      return impliesRoot(node.operand, !negated);
    }
    if (negated) return false;

    if (isRootComparison(node)) return true;

    if (ts.isIdentifier(node)) {
      const declaration = declarations.get(node.text);
      return declaration !== undefined && impliesRoot(declaration, false);
    }

    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        return (
          impliesRoot(node.left, false) || impliesRoot(node.right, false)
        );
      }
      if (operator === ts.SyntaxKind.BarBarToken) {
        return impliesRoot(node.left, false) && impliesRoot(node.right, false);
      }
    }

    return false;
  };

  const restrictedToRoot = (write: IndexWrite): boolean =>
    write.conditions.some(
      (condition) => impliesRoot(condition.node, condition.negated),
    );

  return { writes, restrictedToRoot };
}

describe("service worker navigation cache", () => {
  it("only stores the home page under /index.html", () => {
    const analysis = analyzeSource(readFileSync(swPath, "utf8"));

    expect(analysis.writes.length).toBe(1);

    // The write has to be guarded by the path of the request: a navigation to
    // a catalog page would otherwise replace the cached home page and the
    // offline fallback would serve the wrong document.
    expect(
      analysis.restrictedToRoot(analysis.writes[0]!),
      "the write to /index.html is not guarded by the root path",
    ).toBe(true);
  });

  it("takes a conjunction for a guard", () => {
    const analysis = analyzeSource(`
      const isRoot = url.pathname === '/';
      if (isRoot && otraCosa) cache.put('/index.html', response.clone());
    `);

    expect(analysis.restrictedToRoot(analysis.writes[0]!)).toBe(true);
  });

  it("does not take a disjunction for a guard", () => {
    // In "isRoot || otraCosa" the write happens when either one holds, so it
    // would run for every page that is not the home page too.
    const analysis = analyzeSource(`
      const isRoot = url.pathname === '/';
      if (isRoot || otraCosa) cache.put('/index.html', response.clone());
    `);

    expect(analysis.restrictedToRoot(analysis.writes[0]!)).toBe(false);
  });

  it("does not take the negation of a guard", () => {
    const analysis = analyzeSource(`
      const isRoot = url.pathname === '/';
      if (!isRoot) cache.put('/index.html', response.clone());
    `);

    expect(analysis.restrictedToRoot(analysis.writes[0]!)).toBe(false);
  });
});

/** The document the application serves for every client-side route. */
const SHELL_HTML =
  '<!doctype html><html lang="es"><body><div id="root"></div></body></html>';

/** A generated catalog page: a static document without the mount point. */
const CATALOG_HTML =
  "<!doctype html><html lang=\"es\"><body><main><h1>Job 1</h1></main></body></html>";

interface FetchEvent {
  readonly request: unknown;
  readonly respondWith: (response: Promise<unknown>) => void;
}

interface ServiceWorker {
  readonly handleFetch: (event: FetchEvent) => void;
  readonly cache: Map<string, unknown>;
}

/**
 * Loads the service worker with the browser APIs it uses stubbed.
 *
 * The worker is a plain script, so it runs as it is in the browser: the
 * stubs are the only difference, and the behaviour of the cache is the
 * behaviour of the real one.
 */
function loadServiceWorker(body: string): ServiceWorker {
  const cache = new Map<string, unknown>();
  const listeners = new Map<string, (event: FetchEvent) => void>();

  const scope = {
    console,
    URL,
    Response,
    self: {
      addEventListener: (type: string, handler: (event: FetchEvent) => void) => {
        listeners.set(type, handler);
      },
      skipWaiting: () => {},
      clients: { openWindow: () => Promise.resolve() },
      registration: { showNotification: () => Promise.resolve() },
    },
    caches: {
      open: () =>
        Promise.resolve({
          put: (key: unknown, response: unknown) => {
            const name =
              typeof key === "string"
                ? key
                : String((key as { url?: string }).url);
            cache.set(name, response);
            return Promise.resolve();
          },
          add: () => Promise.resolve(),
          match: (key: unknown) => Promise.resolve(cache.get(String(key))),
        }),
      match: (key: unknown) => Promise.resolve(cache.get(String(key))),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    fetch: () =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
  };

  const context = createContext(scope);
  runInContext(readFileSync(swPath, "utf8"), context);

  const handleFetch = listeners.get("fetch");
  if (handleFetch === undefined) {
    throw new Error("the service worker has no fetch listener");
  }

  return { handleFetch, cache };
}

/** Runs a navigation through the worker and returns what it cached. */
async function navigate(
  serviceWorker: ServiceWorker,
  url: string,
): Promise<Map<string, unknown>> {
  let responded: Promise<unknown> | undefined;

  serviceWorker.handleFetch({
    request: {
      url,
      mode: "navigate",
      method: "GET",
      headers: { get: () => null },
    },
    respondWith: (response) => {
      responded = response;
    },
  });

  await responded;
  // The write into the cache is not awaited by the handler.
  await new Promise((resolve) => setTimeout(resolve, 0));

  return serviceWorker.cache;
}

/**
 * The runtime cache is bounded by excluding the generated pages: they are
 * static documents served from disk, and one entry per page visited would
 * fill the cache of a visitor who reads a few chapters.
 */
describe("the navigation cache of the service worker", () => {
  it("caches the application shell", async () => {
    const serviceWorker = loadServiceWorker(SHELL_HTML);

    const cache = await navigate(serviceWorker, "https://lavozverdad.com/");

    expect(cache.get("/index.html")).toBeDefined();
  });

  it("does not cache a generated catalog page", async () => {
    const serviceWorker = loadServiceWorker(CATALOG_HTML);

    const cache = await navigate(
      serviceWorker,
      "https://lavozverdad.com/biblia/job/1/",
    );

    expect(cache.size).toBe(0);
  });
});
