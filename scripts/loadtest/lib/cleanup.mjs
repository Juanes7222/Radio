import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeSqlLiteral(value) {
  return value.replace(/'/g, "''");
}

/**
 * Builds the three DELETE statements for a run marker. LIKE wildcards are
 * rejected because a marker containing them would delete unrelated rows.
 *
 * @param {string} marker
 * @returns {string[]}
 */
export function cleanupStatements(marker) {
  if (!MARKER_PATTERN.test(marker)) {
    throw new Error("marker must contain only letters, digits, '-' and '_'");
  }
  const value = escapeSqlLiteral(marker);
  return [
    `DELETE FROM prayer_requests WHERE request LIKE '%${value}%';`,
    `DELETE FROM feedback_messages WHERE mensaje LIKE '%${value}%';`,
    `DELETE FROM devices WHERE deviceId LIKE 'k6-${value}%';`,
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const marker = process.argv[2];
  if (!marker) {
    console.error("usage: node scripts/loadtest/lib/cleanup.mjs <marker>");
    process.exit(2);
  }
  for (const statement of cleanupStatements(marker)) {
    console.log(statement);
  }
}
