import WebSocket from "ws";
import { logger } from "../utils/logger";

export interface WorkerEntry {
  workerId: string;
  name: string;
  socket: WebSocket;
  status: "idle" | "busy" | "dead";
  maxConcurrentJobs: number;
  currentJobs: string[];
  currentJobId?: string;
  lastSeenAt: Date;
}

const pool = new Map<string, WorkerEntry>();

export function registerWorker(entry: WorkerEntry): void {
  pool.set(entry.workerId, { ...entry, currentJobs: [] });
  logger.info("WorkerPool", "Worker registered", { workerId: entry.workerId, name: entry.name, maxConcurrentJobs: entry.maxConcurrentJobs });
}

export function updateWorkerHeartbeat(workerId: string, status?: "idle" | "busy", currentJobId?: string): void {
  const worker = pool.get(workerId);
  if (!worker) return;

  worker.lastSeenAt = new Date();
  if (status) {
    worker.status = status;
  }
  if (currentJobId !== undefined) {
    worker.currentJobId = currentJobId;
  }
}

export function markWorkerBusy(workerId: string, jobId: string): void {
  const worker = pool.get(workerId);
  if (!worker) return;

  if (!worker.currentJobs.includes(jobId)) {
    worker.currentJobs.push(jobId);
  }
  worker.currentJobId = jobId;

  if (worker.currentJobs.length >= worker.maxConcurrentJobs) {
    worker.status = "busy";
  }
}

export function markWorkerIdle(workerId: string, jobId?: string): void {
  const worker = pool.get(workerId);
  if (!worker) return;

  if (jobId) {
    worker.currentJobs = worker.currentJobs.filter((id) => id !== jobId);
  } else {
    worker.currentJobs = [];
  }

  worker.currentJobId = worker.currentJobs[0];
  worker.status = worker.currentJobs.length === 0 ? "idle" : "busy";
}

export function removeWorker(workerId: string): void {
  pool.delete(workerId);
  logger.info("WorkerPool", "Worker removed", { workerId });
}

export function getAvailableWorker(maxHeartbeatMs?: number): WorkerEntry | null {
  const now = Date.now();
  for (const worker of pool.values()) {
    if (worker.socket.readyState !== WebSocket.OPEN) continue;
    if (maxHeartbeatMs && now - worker.lastSeenAt.getTime() > maxHeartbeatMs) continue;
    if (worker.currentJobs.length < worker.maxConcurrentJobs) {
      return worker;
    }
  }
  return null;
}

export function getWorker(workerId: string): WorkerEntry | undefined {
  return pool.get(workerId);
}

export function getAllWorkers(): WorkerEntry[] {
  return Array.from(pool.values());
}

export function pruneDeadWorkers(timeoutMs: number): void {
  const now = Date.now();
  for (const [workerId, worker] of pool.entries()) {
    const elapsed = now - worker.lastSeenAt.getTime();
    if (elapsed > timeoutMs) {
      logger.warn("WorkerPool", "Worker timed out, removing", { workerId });
      try {
        worker.socket.close();
      } catch {
        // ignore
      }
      pool.delete(workerId);
    }
  }
}
