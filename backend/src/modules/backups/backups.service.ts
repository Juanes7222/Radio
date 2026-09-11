import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { backupsConfig } from "../../config/backups.config";
import { logger } from "../../shared/logger/logger";

const execFileAsync = promisify(execFile);

export interface BackupBundle {
  name: string;
  scope: "daily" | "weekly";
  size: number;
  mtime: string;
  hasSha256: boolean;
}

export interface BackupStatus {
  status: "OK" | "FAILED";
  time: string;
  archive: string | null;
  bytes: number | null;
  weekly: boolean;
  error: string | null;
}

export interface BackupRunState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  triggeredBy: string | null;
}

const LOG_TAIL_BYTES = 256 * 1024;
const RUN_TIMEOUT_MS = 15 * 60_000;

const runState: BackupRunState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  triggeredBy: null,
};

function statusFilePath(): string {
  return path.join(backupsConfig.dir, "last-backup.status");
}

export function getRunState(): BackupRunState {
  return { ...runState };
}

export async function listBackups(): Promise<BackupBundle[]> {
  const out: BackupBundle[] = [];
  for (const scope of ["daily", "weekly"] as const) {
    const dir = path.join(backupsConfig.dir, scope);
    let names: string[];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/^radio-\d{8}-\d{6}\.tar\.gz$/.test(name)) continue;
      try {
        const full = path.join(dir, name);
        const stat = await fs.promises.stat(full);
        if (!stat.isFile()) continue;
        let hasSha256 = false;
        try {
          const sidecar = await fs.promises.stat(`${full}.sha256`);
          hasSha256 = sidecar.isFile();
        } catch {}
        out.push({
          name,
          scope,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          hasSha256,
        });
      } catch {}
    }
  }
  out.sort((a, b) => b.name.localeCompare(a.name));
  return out;
}

export async function getBackupStatus(): Promise<BackupStatus | null> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(statusFilePath(), "utf-8");
  } catch {
    return null;
  }
  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  if (values.status !== "OK" && values.status !== "FAILED") return null;
  if (!values.time) return null;
  const bytes = values.bytes ? parseInt(values.bytes, 10) : NaN;
  return {
    status: values.status,
    time: values.time,
    archive: values.archive || null,
    bytes: Number.isNaN(bytes) ? null : bytes,
    weekly: values.weekly === "true",
    error: values.error || null,
  };
}

export async function getBackupLog(maxLines: number): Promise<string[]> {
  const limit = Math.min(Math.max(maxLines, 1), 500);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(backupsConfig.logFile);
    if (!stat.isFile() || stat.size === 0) return [];
  } catch {
    return [];
  }
  const readSize = Math.min(stat.size, LOG_TAIL_BYTES);
  const handle = await fs.promises.open(backupsConfig.logFile, "r");
  try {
    const buf = Buffer.alloc(readSize);
    await handle.read(buf, 0, readSize, stat.size - readSize);
    const lines = buf.toString("utf-8").split(/\r?\n/);
    if (stat.size > readSize && lines.length > 0) lines.shift();
    const filtered = lines.filter((line) => line.trim().length > 0);
    return filtered.slice(-limit);
  } finally {
    await handle.close();
  }
}

export function isBackupRunning(): boolean {
  return runState.running;
}

/**
 * Launches scripts/radio-backup.sh in the background without blocking the
 * HTTP response. Returns false when a run is already in progress, and throws
 * when the script is not available on this machine.
 */
export function triggerBackup(triggeredBy: string | null): boolean {
  if (runState.running) return false;

  const script = backupsConfig.scriptPath;
  if (!fs.existsSync(script)) {
    throw new Error(`Backup script not found: ${script}`);
  }

  runState.running = true;
  runState.startedAt = new Date().toISOString();
  runState.finishedAt = null;
  runState.lastError = null;
  runState.triggeredBy = triggeredBy;
  logger.info("Backups", "Manual run started", { triggeredBy });

  execFileAsync("bash", [script], { timeout: RUN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 })
    .then(() => {
      logger.info("Backups", "Manual run finished");
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      runState.lastError = message.slice(0, 500);
      logger.error("Backups", "Manual run failed", { error: runState.lastError });
    })
    .finally(() => {
      runState.running = false;
      runState.finishedAt = new Date().toISOString();
    });

  return true;
}
