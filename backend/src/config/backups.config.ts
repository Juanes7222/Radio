import path from "path";
import fs from "fs";
import { envOr } from "./env";

function resolveScriptPath(): string {
  const override = process.env.BACKUP_SCRIPT_PATH;
  if (override) return override;
  const candidates = [
    path.resolve(process.cwd(), "scripts", "radio-backup.sh"),
    path.resolve(process.cwd(), "..", "scripts", "radio-backup.sh"),
    path.resolve(__dirname, "../../../../scripts/radio-backup.sh"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function getBackupsConfig() {
  return {
    dir: envOr("BACKUP_DIR", "/var/backups/radio"),
    logFile: envOr("BACKUP_LOG_FILE", "/var/log/radio-backup.log"),
    scriptPath: resolveScriptPath(),
  };
}

// Export getters so values are read lazily after Infisical secrets are loaded.
export const backupsConfig = {
  get dir() {
    return getBackupsConfig().dir;
  },
  get logFile() {
    return getBackupsConfig().logFile;
  },
  get scriptPath() {
    return getBackupsConfig().scriptPath;
  },
};

export { getBackupsConfig };
