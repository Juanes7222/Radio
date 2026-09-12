import "dotenv/config";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { initializeInfisicalSecrets } from "@radio/infisical-config";

const RUN_TIMEOUT_MS = 15 * 60_000;

/**
 * Standalone entry point for the systemd backup timer. Loads secrets from
 * Infisical (same flow as the backend bootstrap) and then executes
 * scripts/radio-backup.sh with the enriched environment, so R2 credentials
 * live only in Infisical instead of a server-side env file.
 */
function resolveScriptPath(): string {
  const override = process.env.BACKUP_SCRIPT_PATH;
  if (override) return override;
  const candidates = [
    path.resolve(process.cwd(), "scripts", "radio-backup.sh"),
    path.resolve(process.cwd(), "..", "scripts", "radio-backup.sh"),
    path.resolve(__dirname, "..", "scripts", "radio-backup.sh"),
    path.resolve(__dirname, "..", "..", "scripts", "radio-backup.sh"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

async function main(): Promise<void> {
  const loaded = await initializeInfisicalSecrets();
  console.log(
    loaded
      ? "[run-backup] Infisical secrets loaded"
      : "[run-backup] Infisical not configured, using local environment only"
  );

  const script = resolveScriptPath();
  if (!fs.existsSync(script)) {
    console.error(`[run-backup] Backup script not found: ${script}`);
    process.exit(1);
  }

  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      "bash",
      [script],
      { timeout: RUN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
  console.log("[run-backup] Done");
}

main().catch((err: unknown) => {
  console.error("[run-backup] Failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
