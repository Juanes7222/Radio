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

/** The `if` blocks the line at `index` sits inside, from the outermost in. */
function blocksAround(index: number): string[] {
  const stack: string[] = [];
  for (let i = 0; i <= index; i++) {
    const line = lines[i]?.trim() ?? "";
    if (line.startsWith("if ") && line.endsWith("then")) {
      stack.push(line);
    } else if (line === "fi" || line.startsWith("fi ")) {
      stack.pop();
    }
  }
  return stack;
}

function lineOf(fragment: string): number {
  const index = lines.findIndex((line) => line.includes(fragment));
  expect(index, `no line with "${fragment}" in scripts/deploy.sh`).toBeGreaterThan(-1);
  return index;
}

describe("the deploy wiring of the catalog export", () => {
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
