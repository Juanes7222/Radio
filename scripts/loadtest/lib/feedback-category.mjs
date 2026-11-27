import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const typesSource = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "types",
  "src",
  "feedback.ts"
);

/**
 * Reads a category from the shared type source instead of duplicating the
 * literal in the harness. k6 cannot import TypeScript packages directly, so
 * the orchestrator resolves the value and passes it to the child.
 *
 * @param {string} name
 * @returns {string}
 */
export function readFeedbackCategory(name) {
  const source = readFileSync(typesSource, "utf8");
  const catalogue = source.match(/export const FEEDBACK_CATEGORIES\s*=\s*\{([\s\S]*?)\}\s*as const;/);
  if (!catalogue) {
    throw new Error("FEEDBACK_CATEGORIES not found in packages/types/src/feedback.ts");
  }
  const entry = catalogue[1].match(new RegExp(`\\b${name}\\s*:\\s*'([A-Z_]+)'`));
  if (!entry) {
    throw new Error(`FEEDBACK_CATEGORIES.${name} not found in packages/types/src/feedback.ts`);
  }
  return entry[1];
}
