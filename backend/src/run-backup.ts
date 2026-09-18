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

const R2_REQUIRED_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

function logEnvironmentDiagnostics(phase: string): void {
  const infisicalBootstrap = [
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
    "INFISICAL_PROJECT_ID",
    "INFISICAL_ENVIRONMENT",
  ];
  console.log(
    `[run-backup] ${phase}: cwd=${process.cwd()} ` +
      `infisical=[${infisicalBootstrap
        .map((key) => `${key}=${process.env[key] ? "set" : "missing"}`)
        .join(", ")}] ` +
      `r2=[${R2_REQUIRED_KEYS.map(
        (key) => `${key}=${process.env[key] ? "set" : "missing"}`
      ).join(", ")}]`
  );
}

async function main(): Promise<void> {
  logEnvironmentDiagnostics("env before Infisical");
  const loaded = await initializeInfisicalSecrets();
  console.log(
    loaded
      ? "[run-backup] Infisical secrets loaded"
      : "[run-backup] Infisical not configured, using local environment only"
  );
  logEnvironmentDiagnostics("env after Infisical");

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
