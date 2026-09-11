import http from "http";
import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./shared/logger/logger";
import { handleLiveUpgrade } from "./modules/liveRelay/relay.server";

export function startServer(): http.Server {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info("Server", `Backend running on http://localhost:${config.port}`, {
      stationId: config.azuracast.stationId,
      azuracastUrl: config.azuracast.url,
      whitelist: config.whitelist.length ? config.whitelist.join(", ") : "(empty)",
    });
  });

  // Relevo en vivo de DJs en el mismo origen (sin puerto extra): el navegador
  // conecta a ws(s)://<backend>/live-relay y el backend reenvía a Icecast.
  server.on("upgrade", (req, socket, head) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/live-relay") {
      handleLiveUpgrade(req, socket, head);
      return;
    }
    socket.destroy();
  });

  server.timeout = 600_000;
  server.keepAliveTimeout = 600_000;

  return server;
}
