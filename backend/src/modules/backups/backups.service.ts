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

/**
 * The systemd timer and the backend scheduler both write into the same
 * directory. Whichever wakes up second must not spend disk and R2 space on a
 * duplicate of a bundle that already exists.
 */
const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * The script writes its stamp as `YYYYMMDD-HHMMSS` in server local time, which
 * `Date` cannot parse. Reading it as local time and returning ISO keeps the
 * age calculation in the health check and the panel display correct.
 */
const COMPACT_STAMP = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;

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

function toIsoTimestamp(stamp: string): string | null {
  const match = COMPACT_STAMP.exec(stamp);
  const date = match
    ? new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6])
      )
    : new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
    time: toIsoTimestamp(values.time) ?? values.time,
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
 * Runs the backup script and resolves when it finishes, so a scheduled run can
 * report a real outcome. The run state is set before the first await, which is
 * what keeps two callers in the same tick from starting twice.
 */
async function executeBackup(triggeredBy: string | null): Promise<void> {
  const script = backupsConfig.scriptPath;
  if (!fs.existsSync(script)) {
    throw new Error(`Backup script not found: ${script}`);
  }

  runState.running = true;
  runState.startedAt = new Date().toISOString();
  runState.finishedAt = null;
  runState.lastError = null;
  runState.triggeredBy = triggeredBy;
  logger.info("Backups", "Run started", { triggeredBy });

  try {
    await execFileAsync("bash", [script], { timeout: RUN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
    logger.info("Backups", "Run finished", { triggeredBy });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    runState.lastError = message.slice(0, 500);
    logger.error("Backups", "Run failed", { triggeredBy, error: runState.lastError });
    throw err;
  } finally {
    runState.running = false;
    runState.finishedAt = new Date().toISOString();
  }
}

/** Unconditional run, used by the system jobs panel. */
export async function runBackupNow(triggeredBy: string | null): Promise<void> {
  if (runState.running) {
    throw new Error("Ya hay un backup en ejecución");
  }
  await executeBackup(triggeredBy);
}

/**
 * The daily automatic run. It skips when a bundle was produced inside the
 * duplicate window, because the systemd timer writes the same artifacts and
 * two backups a day would prune the retention faster than documented.
 */
export async function runScheduledBackup(): Promise<void> {
  if (runState.running) {
    logger.info("Backups", "Scheduled run skipped: another run is in progress");
    return;
  }

  const [latest] = await listBackups();
  const latestAge = latest ? Date.now() - new Date(latest.mtime).getTime() : Number.POSITIVE_INFINITY;
  if (latestAge < DUPLICATE_WINDOW_MS) {
    logger.info("Backups", "Scheduled run skipped: bundle is recent", { latest: latest?.name ?? null });
    return;
  }

  await executeBackup("scheduler");
}

/**
 * Launches the script in the background without blocking the HTTP response.
 * Returns false when a run is already in progress.
 */
export function triggerBackup(triggeredBy: string | null): boolean {
  if (runState.running) return false;

  const script = backupsConfig.scriptPath;
  if (!fs.existsSync(script)) {
    throw new Error(`Backup script not found: ${script}`);
  }

  void executeBackup(triggeredBy).catch(() => {
    // executeBackup already logged the failure and stored it in runState.
  });

  return true;
}
