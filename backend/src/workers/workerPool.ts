import WebSocket from "ws";
import { logger } from "../utils/logger";

export interface WorkerEntry {
  workerId: string;
  name: string;
  socket: WebSocket;
  status: "idle" | "busy" | "dead";
  maxConcurrentJobs: number;
  currentJobId?: string;
  lastSeenAt: Date;
}

const pool = new Map<string, WorkerEntry>();

export function registerWorker(entry: WorkerEntry): void {
  pool.set(entry.workerId, entry);
  logger.info("WorkerPool", "Worker registered", { workerId: entry.workerId, name: entry.name });
}

export function updateWorkerHeartbeat(workerId: string, status: "idle" | "busy", currentJobId?: string): void {
  const worker = pool.get(workerId);
  if (!worker) return;

  worker.lastSeenAt = new Date();
  worker.status = status;
  worker.currentJobId = currentJobId;
}

export function markWorkerBusy(workerId: string, jobId: string): void {
  const worker = pool.get(workerId);
  if (!worker) return;
  worker.status = "busy";
  worker.currentJobId = jobId;
}

export function markWorkerIdle(workerId: string): void {
  const worker = pool.get(workerId);
  if (!worker) return;
  worker.status = "idle";
  worker.currentJobId = undefined;
}

export function removeWorker(workerId: string): void {
  pool.delete(workerId);
  logger.info("WorkerPool", "Worker removed", { workerId });
}

export function getAvailableWorker(): WorkerEntry | null {
  for (const worker of pool.values()) {
    if (worker.status === "idle" && worker.socket.readyState === WebSocket.OPEN) {
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
      pool.delete(workerId);
    }
  }
}