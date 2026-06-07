import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
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
} from "./workerPool";
import { handleJobDone, handleJobError, handleJobStatus } from "../jobs/jobDispatcher";

export function startWorkerServer(): WebSocketServer {
  const wss = new WebSocketServer({ port: parseInt(process.env.WS_PORT ?? "3001", 10) });

  logger.info("WorkerServer", "WebSocket server started", { port: process.env.WS_PORT ?? "3001" });

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
          updateWorkerHeartbeat(message.workerId, "idle");
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
          markWorkerIdle(message.workerId);
          break;

        case "job_error":
          await handleJobError(message);
          markWorkerIdle(message.workerId);
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

  // Limpia workers muertos cada 30 segundos
  setInterval(() => {
    pruneDeadWorkers(parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT_MS ?? "60000", 10));
  }, 30_000);

  return wss;
}

async function handleRegister(socket: WebSocket, message: RegisterMessage): Promise<string | null> {
  if (message.secret !== process.env.WORKER_AUTH_SECRET) {
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