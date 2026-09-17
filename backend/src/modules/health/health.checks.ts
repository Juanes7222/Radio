import fs from "fs";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { getPanelStatus } from "../azuracast/panel.service";
import { getAllWorkers } from "../workers/workerPool";
import { prisma } from "../../infrastructure/database/prisma";
import { getBackupStatus } from "../backups/backups.service";
import { config } from "../../config";
import type {
  HealthCheckResult,
  HealthCheckIssue,
  HealthStatus,
} from "./health.types";

interface DiskUsage {
  freePercent: number;
  totalGb: number;
  freeGb: number;
}

function toIssue(code: string, message: string, since: string | null): HealthCheckIssue {
  return { code, message, since };
}

function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("degraded")) return "degraded";
  return "ok";
}

async function getDiskUsage(mountPath: string): Promise<DiskUsage> {
  const stats = await fs.promises.statfs(mountPath);
  const total = stats.blocks * stats.bsize;
  const free = stats.bavail * stats.bsize;
  if (total <= 0) {
    throw new Error(`Invalid statfs data for ${mountPath}`);
  }
  return {
    totalGb: total / 1024 ** 3,
    freeGb: free / 1024 ** 3,
    freePercent: (free / total) * 100,
  };
}

/**
 * AzuraCast reachability: one now-playing call proves API, database and
 * liquidsoap backend are answering. 502/timeout => critical.
 */
export async function checkAzuracast(): Promise<HealthCheckResult> {
  const key: HealthCheckResult["key"] = "azuracast";
  const checkedAt = new Date().toISOString();
  try {
    const panel = await getPanelStatus();
    return {
      key,
      label: "AzuraCast",
      status: "ok",
      detail: `API OK · ${panel.listeners} oyentes · ${panel.currentSong ?? "sin canción"}`,
      issues: [],
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      key,
      label: "AzuraCast",
      status: "critical",
      detail: "AzuraCast no responde",
      issues: [toIssue("azuracast_unreachable", message, checkedAt)],
      checkedAt,
    };
  }
}

/**
 * AutoDJ must be playing. During silence the backend type stays valid but
 * media stops advancing, so we track the current song start time.
 */
export async function checkAutoDj(): Promise<HealthCheckResult> {
  const key: HealthCheckResult["key"] = "autodj";
  const checkedAt = new Date().toISOString();
  try {
    const { data: np } = await azuracastApi.get(`/nowplaying/${STATION_ID}`, {
      timeout: 8_000,
    });
    const isPlaying = Boolean(np?.is_online) && !np?.live?.is_live;
    const song = np?.now_playing?.song ?? {};
    const startedAt: string | null = np?.now_playing?.played_at ?? null;
    const elapsedSeconds = startedAt
      ? Math.floor(Date.now() / 1000) - Number(startedAt)
      : 0;

    if (Number.isNaN(elapsedSeconds)) {
      return {
        key,
        label: "AutoDJ",
        status: "degraded",
        detail: "No se pudo leer el tiempo de la canción actual",
        issues: [toIssue("autodj_elapsed_unknown", "played_at no numérico", checkedAt)],
        checkedAt,
      };
    }

    if (!isPlaying) {
      return {
        key,
        label: "AutoDJ",
        status: "critical",
        detail: "El stream está caído o AutoDJ detenido",
        issues: [
          toIssue("autodj_not_playing", "is_online=false o live activo", checkedAt),
        ],
        checkedAt,
      };
    }

    if (
      startedAt &&
      elapsedSeconds > config.health.nowPlayingSilenceSeconds &&
      Number(np?.now_playing?.duration ?? 0) === 0
    ) {
      return {
        key,
        label: "AutoDJ",
        status: "degraded",
        detail: `Sin avanzar la pista por ${Math.round(elapsedSeconds / 60)} min`,
        issues: [
          toIssue("autodj_silence", `elapsed=${elapsedSeconds}s`, checkedAt),
        ],
        checkedAt: new Date().toISOString(),
      };
    }

    const minutes = Math.floor(elapsedSeconds / 60);
    return {
      key,
      label: "AutoDJ",
      status: "ok",
      detail: `Reproduciendo (${minutes} min en pista actual)`,
      issues: [],
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      key,
      label: "AutoDJ",
      status: "degraded",
      detail: "No se pudo consultar now-playing",
      issues: [toIssue("autodj_query_failed", message, checkedAt)],
      checkedAt,
    };
  }
}

/**
 * At least one worker must be connected with a fresh heartbeat.
 */
export async function checkWorkers(): Promise<HealthCheckResult> {
  const key: HealthCheckResult["key"] = "workers";
  const checkedAt = new Date().toISOString();
  const all = getAllWorkers();
  const timeoutMs = config.worker.heartbeatTimeoutMs;
  const now = Date.now();

  const alive = all.filter(
    (worker) => now - worker.lastSeenAt.getTime() <= timeoutMs
  );

  if (alive.length === 0) {
    return {
      key,
      label: "Workers",
      status: "critical",
      detail: all.length === 0
        ? "Ningún worker conectado"
        : "Workers conectados pero con latido vencido",
      issues: [
        toIssue(
          "no_alive_workers",
          all.length === 0 ? "pool vacío" : "heartbeat timeout",
          checkedAt
        ),
      ],
      checkedAt,
    };
  }

  const detail = alive
    .map((worker) => `${worker.name} (${worker.status})`)
    .join(", ");
  return {
    key,
    label: "Workers",
    status: "ok",
    detail: `${alive.length} worker(s) activo(s): ${detail}`,
    issues: [],
    checkedAt,
  };
}

/**
 * Processing jobs stuck in ERROR or ABANDONED need a human decision;
 * RETRYING with exhausted attempts means the system is degrading.
 */
export async function checkYoutubeJobs(): Promise<HealthCheckResult> {
  const key: HealthCheckResult["key"] = "youtube_jobs";
  const checkedAt = new Date().toISOString();

  const [errored, abandoned, retrying] = await Promise.all([
    prisma.processingJob.count({ where: { status: "ERROR" } }),
    prisma.processingJob.count({ where: { status: "ABANDONED" } }),
    prisma.processingJob.count({
      where: { status: "RETRYING", attempts: { gte: config.processing.maxRetryAttempts } },
    }),
  ]);

  const issues: HealthCheckIssue[] = [];
  let status: HealthStatus = "ok";
  let detail = "Sin jobs en error";

  if (abandoned > 0) {
    status = "critical";
    detail = `${abandoned} job(s) abandonado(s)`;
    issues.push(toIssue("jobs_abandoned", `${abandoned} ABANDONED`, checkedAt));
  }
  if (errored > 0) {
    status = "critical";
    detail = `${errored} job(s) en ERROR`;
    issues.push(toIssue("jobs_errored", `${errored} ERROR`, checkedAt));
  }
  if (retrying > 0 && status === "ok") {
    status = "degraded";
    detail = `${retrying} job(s) reintentando sin éxito`;
    issues.push(toIssue("jobs_retry_exhausted", `${retrying} RETRYING`, checkedAt));
  }

  return { key, label: "Jobs de YouTube", status, detail, issues, checkedAt };
}

/**
 * Free disk space on the mount that holds AzuraCast media.
 */
export async function checkDisk(): Promise<HealthCheckResult> {
  const key: HealthCheckResult["key"] = "disk";
  const checkedAt = new Date().toISOString();
  try {
    const usage = await getDiskUsage(config.health.diskMountPath);
    if (usage.freePercent < config.health.diskMinFreePercent / 2) {
      return {
        key,
        label: "Disco",
        status: "critical",
        detail: `${usage.freePercent.toFixed(1)}% libre (${usage.freeGb.toFixed(1)} GB de ${usage.totalGb.toFixed(0)} GB)`,
        issues: [toIssue("disk_critical", `free=${usage.freePercent.toFixed(1)}%`, checkedAt)],
        checkedAt,
      };
    }
    if (usage.freePercent < config.health.diskMinFreePercent) {
      return {
        key,
        label: "Disco",
        status: "degraded",
        detail: `${usage.freePercent.toFixed(1)}% libre (${usage.freeGb.toFixed(1)} GB de ${usage.totalGb.toFixed(0)} GB)`,
        issues: [toIssue("disk_low", `free=${usage.freePercent.toFixed(1)}%`, checkedAt)],
        checkedAt,
      };
    }
    return {
      key,
      label: "Disco",
      status: "ok",
      detail: `${usage.freePercent.toFixed(1)}% libre (${usage.freeGb.toFixed(1)} GB)`,
      issues: [],
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      key,
      label: "Disco",
      status: "degraded",
      detail: "No se pudo leer el uso del disco",
      issues: [toIssue("disk_unavailable", message, checkedAt)],
      checkedAt,
    };
  }
}

/**
 * The last backup must exist, be OK and be recent enough.
 */
export async function checkBackup(): Promise<HealthCheckResult> {
  const key: HealthCheckResult["key"] = "backup";
  const checkedAt = new Date().toISOString();
  const status = await getBackupStatus();

  if (!status) {
    return {
      key,
      label: "Respaldos",
      status: "degraded",
      detail: "Sin registro del último respaldo",
      issues: [toIssue("backup_unknown", "last-backup.status ausente", checkedAt)],
      checkedAt,
    };
  }

  const ageHours =
    (Date.now() - new Date(status.time).getTime()) / (60 * 60 * 1000);

  if (Number.isNaN(ageHours)) {
    return {
      key,
      label: "Respaldos",
      status: "degraded",
      detail: "Fecha del último respaldo ilegible",
      issues: [toIssue("backup_time_invalid", status.time, checkedAt)],
      checkedAt,
    };
  }

  if (status.status === "FAILED") {
    return {
      key,
      label: "Respaldos",
      status: "critical",
      detail: `Último respaldo FALLIDO: ${status.error ?? "sin detalle"}`,
      issues: [toIssue("backup_failed", status.error ?? "FAILED", checkedAt)],
      checkedAt,
    };
  }

  if (ageHours > config.health.backupMaxAgeHours) {
    return {
      key,
      label: "Respaldos",
      status: "critical",
      detail: `Último respaldo hace ${ageHours.toFixed(0)} h`,
      issues: [toIssue("backup_stale", `age=${ageHours.toFixed(1)}h`, checkedAt)],
      checkedAt,
    };
  }

  return {
    key,
    label: "Respaldos",
    status: "ok",
    detail: `OK hace ${ageHours.toFixed(1)} h`,
    issues: [],
    checkedAt,
  };
}

/**
 * The listener sampling job (dashboard graph) must keep writing snapshots.
 */
export async function checkListenerSampling(): Promise<HealthCheckResult> {
  const key: HealthCheckResult["key"] = "listener_sampling";
  const checkedAt = new Date().toISOString();
  const last = await prisma.listenerSnapshot.findFirst({
    orderBy: { recordedAt: "desc" },
    select: { recordedAt: true },
  });

  if (!last) {
    return {
      key,
      label: "Muestreo de oyentes",
      status: "degraded",
      detail: "Sin muestras de oyentes registradas",
      issues: [toIssue("listener_sampling_empty", "sin snapshots", checkedAt)],
      checkedAt,
    };
  }

  const ageHours =
    (Date.now() - last.recordedAt.getTime()) / (60 * 60 * 1000);
  if (ageHours > config.health.snapshotMaxAgeHours) {
    return {
      key,
      label: "Muestreo de oyentes",
      status: "degraded",
      detail: `Última muestra hace ${ageHours.toFixed(1)} h`,
      issues: [toIssue("listener_sampling_stale", `age=${ageHours.toFixed(1)}h`, checkedAt)],
      checkedAt,
    };
  }

  return {
    key,
    label: "Muestreo de oyentes",
    status: "ok",
    detail: `Última muestra hace ${Math.round(ageHours * 60)} min`,
    issues: [],
    checkedAt,
  };
}

export interface HealthCheckRun {
  results: HealthCheckResult[];
  status: HealthStatus;
}

/** Runs every check in parallel and merges their worst status. */
export async function runAllHealthChecks(): Promise<HealthCheckRun> {
  const results = await Promise.all([
    checkAzuracast(),
    checkAutoDj(),
    checkWorkers(),
    checkYoutubeJobs(),
    checkDisk(),
    checkBackup(),
    checkListenerSampling(),
  ]);
  return {
    results,
    status: worstStatus(results.map((result) => result.status)),
  };
}

export { worstStatus };
