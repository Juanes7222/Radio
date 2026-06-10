import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import {
  WorkerMessage,
  RegisterMessage,
} from "../types/protocol.types";
import {
  registerWorker,
  updateWorkerHeartbeat,
  markWorkerIdle,
  removeWorker,
  pruneDeadWorkers,
  getAllWorkers,
} from "./workerPool";
import { handleJobDone, handleJobError, handleJobStatus } from "../jobs/jobDispatcher";

export function startWorkerServer(): WebSocketServer {
  const wss = new WebSocketServer({ port: config.worker.port });

  logger.info("WorkerServer", "WebSocket server started", { port: config.worker.port });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    logger.info("WorkerServer", "New connection attempt", { ip: req.socket.remoteAddress });

    let authenticatedWorkerId: string | null = null;

    socket.on("message", async (raw) => {
      let message: WorkerMessage;

      try {
        message = JSON.parse(raw.toString()) as WorkerMessage;
      } catch {
        logger.warn("WorkerServer", "Invalid JSON from worker");
        socket.close(1008, "Invalid JSON");
        return;
      }

      if (message.type === "register") {
        authenticatedWorkerId = await handleRegister(socket, message as RegisterMessage);
        return;
      }

      if (!authenticatedWorkerId) {
        socket.close(1008, "Not authenticated");
        return;
      }

      switch (message.type) {
        case "heartbeat":
          updateWorkerHeartbeat(message.workerId, message.status, message.currentJobId);
          break;

        case "pong":
          // Solo actualiza lastSeenAt, no muta el status
          updateWorkerHeartbeat(message.workerId);
          break;

        case "job_ack":
          logger.info("WorkerServer", "Job acknowledged", { jobId: message.jobId, workerId: message.workerId });
          await handleJobStatus(message.jobId, "ACKED");
          break;

        case "job_status":
          await handleJobStatus(message.jobId, message.status);
          break;

        case "job_done":
          await handleJobDone(message);
          markWorkerIdle(message.workerId, message.jobId);
          break;

        case "job_error":
          await handleJobError(message);
          markWorkerIdle(message.workerId, message.jobId);
          break;
      }
    });

    socket.on("close", () => {
      if (authenticatedWorkerId) {
        removeWorker(authenticatedWorkerId);
        logger.info("WorkerServer", "Worker disconnected", { workerId: authenticatedWorkerId });
      }
    });

    socket.on("error", (err) => {
      logger.error("WorkerServer", "Socket error", { error: err.message });
    });
  });

  // Ping a todos los workers cada 30 segundos
  setInterval(() => {
    for (const worker of getAllWorkers()) {
      if (worker.socket.readyState === WebSocket.OPEN) {
        try {
          worker.socket.send(JSON.stringify({ type: "ping" }));
        } catch {
          // ignore
        }
      }
    }
  }, 30_000);

  // Limpia workers muertos cada 30 segundos
  setInterval(() => {
    pruneDeadWorkers(config.workerHeartbeatTimeoutMs);
  }, 30_000);

  return wss;
}

async function handleRegister(socket: WebSocket, message: RegisterMessage): Promise<string | null> {
  if (message.secret !== config.worker.authSecret) {
    logger.warn("WorkerServer", "Worker auth failed", { workerId: message.workerId });
    socket.close(1008, "Invalid secret");
    return null;
  }

  registerWorker({
    workerId: message.workerId,
    name: message.name,
    socket,
    status: "idle",
    maxConcurrentJobs: message.maxConcurrentJobs,
    currentJobs: [],
    lastSeenAt: new Date(),
  });

  await prisma.workerNode.upsert({
    where: { workerId: message.workerId },
    create: { workerId: message.workerId, name: message.name, status: "ONLINE" },
    update: { name: message.name, status: "ONLINE", lastSeenAt: new Date() },
  });

  socket.send(JSON.stringify({ type: "acknowledge", message: "registered" }));
  logger.info("WorkerServer", "Worker authenticated", { workerId: message.workerId });
  return message.workerId;
}
