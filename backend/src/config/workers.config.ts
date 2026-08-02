import { intEnvOr, requiredEnv } from "./env";

export const workersConfig = {
  authSecret: requiredEnv("WORKER_AUTH_SECRET"),
  port: intEnvOr("WS_PORT", 3001),
  heartbeatTimeoutMs: intEnvOr("WORKER_HEARTBEAT_TIMEOUT_MS", 60_000),
  jobDispatchIntervalMs: intEnvOr("JOB_DISPATCH_INTERVAL_MS", 2000),
};
