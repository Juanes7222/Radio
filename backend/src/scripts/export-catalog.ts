import "dotenv/config";
import { initializeInfisicalSecrets } from "@radio/infisical-config";

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
    const { exportCatalog } = await import("../modules/catalog/catalog.service");
    const target = process.argv[2] ?? "../../apps/web/catalog/catalog.json";
    const counts = await exportCatalog(target);
    console.log(
      `[catalog] books=${counts.books} chapters=${counts.chapters} artists=${counts.artists} videos=${counts.videos}`
    );
  } finally {
    const { prisma } = await import("../infrastructure/database/prisma");
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[catalog] Export failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
