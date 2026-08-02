import "dotenv/config";
import { initializeInfisicalSecrets } from "./infrastructure/secrets/infisical.service";

async function bootstrap(): Promise<void> {
  const infisicalInitialized = await initializeInfisicalSecrets();
  if (infisicalInitialized) {
    console.log("[Infisical] Secrets loaded successfully");
  } else {
    console.log("[Infisical] Not configured or failed. Using local .env only.");
  }

  const { startScheduler } = await import("./jobs/scheduler");
  const { startServer } = await import("./server");
  const { startWorkerServer } = await import("./modules/workers/workerServer");
  const { dispatchPendingJobs } = await import("./modules/workers/jobDispatcher");
  const { subscribeToAllConfiguredChannels } = await import(
    "./modules/youtube/subscription.service"
  );
  const { config } = await import("./config");
  const { logger } = await import("./shared/logger/logger");

  const YOUTUBE_RESUBSCRIBE_INTERVAL_MS = 20 * 60 * 60 * 1000;
  const JOB_DISPATCH_INTERVAL_MS = config.worker.jobDispatchIntervalMs;

  startScheduler();

  const server = startServer();

  startWorkerServer();

  setInterval(dispatchPendingJobs, JOB_DISPATCH_INTERVAL_MS);

  await subscribeToAllConfiguredChannels();
  setInterval(subscribeToAllConfiguredChannels, YOUTUBE_RESUBSCRIBE_INTERVAL_MS);

  server.timeout = 600_000;
  server.keepAliveTimeout = 600_000;
}

bootstrap().catch((err) => {
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});
