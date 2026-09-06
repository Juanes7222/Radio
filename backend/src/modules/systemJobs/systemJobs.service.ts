import { logger } from "../../shared/logger/logger";
import {
  SYSTEM_JOB_CATALOG,
  SYSTEM_JOB_RUNNERS,
  type SystemJobKey,
  type SystemJobMeta,
} from "./systemJobs.registry";

export type SystemJobStatus = "idle" | "running" | "success" | "error";

export interface SystemJobState {
  status: SystemJobStatus;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  triggeredBy: string | null;
}

export interface SystemJobWithState extends SystemJobMeta {
  state: SystemJobState;
}

const states = new Map<SystemJobKey, SystemJobState>();

function getState(key: SystemJobKey): SystemJobState {
  const existing = states.get(key);
  if (existing) return existing;
  const initial: SystemJobState = {
    status: "idle",
    running: false,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    triggeredBy: null,
  };
  states.set(key, initial);
  return initial;
}

export function listSystemJobs(): SystemJobWithState[] {
  return SYSTEM_JOB_CATALOG.map((meta) => ({ ...meta, state: { ...getState(meta.key) } }));
}

export function isJobRunning(key: SystemJobKey): boolean {
  return getState(key).running;
}

/**
 * Runs a job in the background without blocking the HTTP response.
 * Returns false when the job is already running so the route can answer 409.
 */
export function triggerSystemJob(key: SystemJobKey, triggeredBy: string | null): boolean {
  const state = getState(key);
  if (state.running) return false;

  state.status = "running";
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.lastError = null;
  state.triggeredBy = triggeredBy;

  logger.info("SystemJobs", "Manual run started", { job: key, triggeredBy });

  const runner = SYSTEM_JOB_RUNNERS[key];
  void runner()
    .then(() => {
      state.status = "success";
      logger.info("SystemJobs", "Manual run finished", { job: key });
    })
    .catch((err: unknown) => {
      state.status = "error";
      state.lastError = err instanceof Error ? err.message : String(err);
      logger.error("SystemJobs", "Manual run failed", { job: key, error: state.lastError });
    })
    .finally(() => {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    });

  return true;
}
