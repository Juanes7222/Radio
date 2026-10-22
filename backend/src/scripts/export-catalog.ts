import "dotenv/config";
import { initializeInfisicalSecrets } from "@radio/infisical-config";
import { prisma } from "../infrastructure/database/prisma";

/**
 * Writes the catalog artifact the web build reads.
 *
 * The secrets are loaded before anything imports the configuration, because
 * `src/config` throws at import time when a variable is missing. The export
 * itself is imported afterwards, for the same reason.
 */
async function main(): Promise<void> {
  await initializeInfisicalSecrets();

  try {
    const { exportCatalog, defaultCatalogPath } = await import("../modules/catalog/catalog.service");
    const target = process.argv[2] ?? defaultCatalogPath();
    const counts = await exportCatalog(target);
    const capped = counts.videosTotal > counts.videos ? ` (of ${counts.videosTotal})` : "";
    console.log(
      `[catalog] books=${counts.books} chapters=${counts.chapters} artists=${counts.artists} videos=${counts.videos}${capped}`
    );
  } finally {
    await disconnect();
  }
}

/**
 * Closes the client without throwing.
 *
 * A cleanup that throws replaces the error the operator has to read, and the
 * one that says what actually went wrong is the one that matters.
 */
async function disconnect(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch {
    // The cleanup never masks a real failure.
  }
}

main().catch((err: unknown) => {
  console.error("[catalog] Export failed:", err instanceof Error ? err.stack ?? err.message : String(err));
  const url = requestUrl(err);
  if (url) console.error(`[catalog] Request: ${url}`);
  process.exit(1);
});

/** The URL of the request that failed, when the error carries one. */
function requestUrl(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const config = (err as { config?: { url?: string } }).config;
  return typeof config?.url === "string" ? config.url : undefined;
}
