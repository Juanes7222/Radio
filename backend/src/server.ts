import http from "http";
import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./shared/logger/logger";

export function startServer(): http.Server {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info("Server", `Backend running on http://localhost:${config.port}`, {
      stationId: config.azuracast.stationId,
      azuracastUrl: config.azuracast.url,
      whitelist: config.whitelist.length ? config.whitelist.join(", ") : "(empty)",
    });
  });

  server.timeout = 600_000;
  server.keepAliveTimeout = 600_000;

  return server;
}
