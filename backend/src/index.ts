import "dotenv/config";
import { initializeInfisicalSecrets } from "@radio/infisical-config";

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
  const { refreshChannelSubscriptions } = await import(
    "./modules/youtube/subscription.service"
  );
  const { config } = await import("./config");
  const { logger } = await import("./shared/logger/logger");

  // Announcements read the station clock explicitly, but the day keys stored in
  // the database still come from the process clock: a mismatch shifts them.
  const processTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (processTimeZone !== config.locutor.timezone) {
    logger.warn("Bootstrap", "Process time zone differs from station time zone", {
      processTimeZone,
      stationTimeZone: config.locutor.timezone,
    });
  }

  const JOB_DISPATCH_INTERVAL_MS = config.worker.jobDispatchIntervalMs;

  startScheduler();

  const server = startServer();

  startWorkerServer();

  setInterval(dispatchPendingJobs, JOB_DISPATCH_INTERVAL_MS);

  // Fire and forget: ingestion should not wait for the hub, and a station with no
  // channel registered answers instantly. The cadence belongs to the cron; this
  // pass only exists so a restart resumes the list without waiting six hours.
  void refreshChannelSubscriptions().catch((err) => {
    logger.error("Bootstrap", "Initial YouTube subscription refresh failed", {
      error: String(err),
    });
  });

  server.timeout = 600_000;
  server.keepAliveTimeout = 600_000;
}

bootstrap().catch((err) => {
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});