import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lines = readFileSync(join(__dirname, "..", "..", "..", "scripts", "deploy.sh"), "utf8").split(
  /\r?\n/
);

const TYPES_BUILD = '--filter "$TYPES_PACKAGE" run build';
const INFISICAL_BUILD = '--filter "$INFISICAL_PACKAGE" run build';
const PRISMA_GENERATE = "run prisma:generate";
const CATALOG_EXPORT = "run catalog:export";
const WEB_BUILD = '--filter "$WEB_PACKAGE" run build';

interface Scan {
  readonly openers: number;
  readonly closers: number;
  readonly stack: string[];
}

/**
 * The code of a line, without the parts inside a single-quoted string.
 *
 * The deploy embeds a node script in a single-quoted argument, and that
 * script carries `if` and `fi` of its own. Counting them would open and close
 * blocks that do not exist.
 */
function codeOutsideStrings(line: string, state: { inString: boolean }): string {
  let code = "";
  for (const char of line) {
    if (char === "'") {
      state.inString = !state.inString;
    } else if (!state.inString) {
      code += char;
    }
  }
  return code.trim();
}

/**
 * Walks the script and keeps the stack of the `if` blocks that are open.
 *
 * A block can be opened with the `then` on its own line, which is what the
 * audit block does, so the opener waits for its `then`.
 */
function scan(upToLine: number): Scan {
  const state = { inString: false };
  const stack: string[] = [];
  let openers = 0;
  let closers = 0;
  let pending: string | null = null;

  for (let i = 0; i <= upToLine; i++) {
    const code = codeOutsideStrings(lines[i] ?? "", state);

    if (code === "then") {
      if (pending !== null) {
        stack.push(pending);
        openers++;
        pending = null;
      }
      continue;
    }

    if (code.startsWith("if ")) {
      if (code.endsWith("then")) {
        stack.push(code);
        openers++;
      } else {
        pending = code;
      }
      continue;
    }

    if (code === "fi" || code.startsWith("fi ")) {
      stack.pop();
      closers++;
    }
  }

  return { openers, closers, stack };
}

/** The `if` blocks the line at `index` sits inside, from the outermost in. */
function blocksAround(index: number): string[] {
  return scan(index).stack;
}

function lineOf(fragment: string): number {
  const index = lines.findIndex((line) => line.includes(fragment));
  expect(index, `no line with "${fragment}" in scripts/deploy.sh`).toBeGreaterThan(-1);
  return index;
}

describe("the deploy wiring of the catalog export", () => {
  it("reads every block of the script, with the `then` on its own line", () => {
    const whole = scan(lines.length - 1);

    expect(whole.openers).toBe(whole.closers);
    expect(whole.stack).toEqual([]);
  });

  it("runs the export in the frontend path, right before the web build", () => {
    const exportLine = lineOf(CATALOG_EXPORT);

    expect(exportLine).toBeLessThan(lineOf(WEB_BUILD));
    expect(blocksAround(exportLine).some((block) => block.includes("DEPLOY_FRONTEND"))).toBe(true);
    expect(blocksAround(exportLine).some((block) => block.includes("DEPLOY_BACKEND"))).toBe(false);
  });

  it("builds what the export imports outside the backend-only block", () => {
    const infisicalBuild = lineOf(INFISICAL_BUILD);
    const prismaGenerate = lineOf(PRISMA_GENERATE);
    const exportLine = lineOf(CATALOG_EXPORT);

    // The export imports @radio/infisical-config and the Prisma client, and
    // it runs with the web build, so both have to be built in every mode.
    expect(infisicalBuild).toBeLessThan(exportLine);
    expect(prismaGenerate).toBeLessThan(exportLine);
    expect(
      blocksAround(infisicalBuild).some((block) => block.includes("DEPLOY_BACKEND"))
    ).toBe(false);
    expect(blocksAround(prismaGenerate).some((block) => block.includes("DEPLOY_BACKEND"))).toBe(
      false
    );
  });

  it("keeps building @radio/types for both targets", () => {
    expect(lineOf(TYPES_BUILD)).toBeLessThan(lineOf(WEB_BUILD));
  });
});
