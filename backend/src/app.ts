import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import path from "path";
import { errorHandler } from "./shared/errors/error-handler";
import { config } from "./config";
import { logger } from "./shared/logger/logger";
import authRouter from "./modules/auth/auth.routes";
import proxyRouter from "./modules/azuracast/proxy.routes";
import publicRouter from "./modules/azuracast/public.routes";
import uploadRouter from "./modules/azuracast/upload.routes";
import webhookRouter from "./modules/webhook/webhook.routes";
import panelRouter from "./modules/azuracast/panel.routes";
import liveStatusRouter from "./modules/live/live.routes";
import liveAdminRouter from "./modules/live/live.admin.routes";
import bibleRouter from "./modules/bible/bible.routes";
import locutorRouter from "./modules/locutor/locutor.routes";
import youtubeRouter from "./modules/youtube/youtube.routes";
import workerAdminRouter from "./modules/workers/workerAdmin.routes";
import prayerRouter from "./modules/prayer/prayer.routes";
import devicesRouter from "./modules/devices/devices.routes";
import internalTestRouter from "./modules/internal/internalTest.routes";
import scheduleCategoriesRouter from "./modules/schedule/category.routes";
import devicesAdminRouter from "./modules/devices/admin.routes";
import listenerHistoryRouter from "./modules/azuracast/listenerHistory.routes";
import rotationRouter from "./modules/rotation/rotation.routes";
import noticesPublicRouter from "./modules/notices/public.routes";
import noticesAdminRouter from "./modules/notices/admin.routes";
import noticeImagesRouter from "./modules/notices/noticeImages.routes";
import swaggerFile from "./swagger-output.json";

const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:4173"];

export function createApp(): Express {
  const app = express();

  app.use(morgan("dev"));
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: ALLOWED_ORIGINS,
      credentials: true,
    })
  );

  app.use(
    "/admin-api/youtube/webhook",
    express.text({ type: "application/atom+xml" }),
    express.text({ type: "text/xml" }),
    express.text({ type: "application/xml" })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", publicRouter);
  app.use("/admin-api/auth", authRouter);
  app.use("/admin-api", proxyRouter);
  app.use("/admin-api/upload", uploadRouter);
  app.use("/webhook", webhookRouter);
  app.use("/panel-api", panelRouter);
  app.use("/live-status", liveStatusRouter);
  app.use("/admin-api/live", liveAdminRouter);
  app.use("/admin-api/locutor", locutorRouter);
  app.use("/admin-api/youtube", youtubeRouter);
  app.use("/api/bible", bibleRouter);
  app.use("/admin-api/workers", workerAdminRouter);
  app.use("/internal", internalTestRouter);
  app.use("/admin-api/schedule-categories", scheduleCategoriesRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/admin-api/devices", devicesAdminRouter);
  app.use("/admin-api/listeners", listenerHistoryRouter);
  app.use("/admin-api/rotations", rotationRouter);
  app.use("/api/notices", noticesPublicRouter);
  app.use("/admin-api/notices", noticesAdminRouter);
  app.use("/admin-api/notices", noticeImagesRouter);
  // imágenes optimizadas reusables — servir estático con cache
  app.use(
    "/media/notices",
    express.static(path.resolve(process.cwd(), "backend", "storage", "notice-images"), {
      maxAge: "30d",
      immutable: true,
      setHeaders(res) {
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      },
    }),
  );
  app.use("/api/prayer", prayerRouter);

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get("/admin-api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use(errorHandler);

  return app;
}
