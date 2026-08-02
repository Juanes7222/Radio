import { Router, type NextFunction, type Request, type Response } from "express";
import axios from "axios";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getPanelStatus, startAutoDj, stopAutoDj } from "./panel.service";

const router = Router();

function requirePanelSecret(req: Request, res: Response, next: NextFunction): void {
  if (req.headers["x-panel-secret"] !== config.panelSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requirePanelSecret);

router.get("/status", async (_req, res) => {
  try {
    const status = await getPanelStatus();
    res.json(status);
  } catch (err) {
    sendPanelError(res, err, "AzuraCast no disponible");
  }
});

router.post("/autodj/stop", async (_req, res) => {
  try {
    await stopAutoDj();
    res.json({ ok: true });
  } catch (err) {
    sendPanelError(res, err, "Error al detener AutoDJ");
  }
});

router.post("/autodj/start", async (_req, res) => {
  try {
    await startAutoDj();
    res.json({ ok: true });
  } catch (err) {
    sendPanelError(res, err, "Error al iniciar AutoDJ");
  }
});

function sendPanelError(res: Response, err: unknown, unavailableMessage: string): void {
  const code = (err as { code?: string })?.code;
  if (code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    logger.warn("PanelRoutes", "AzuraCast not available from panel status");
    res.status(502).json({ error: unavailableMessage });
    return;
  }

  if (axios.isAxiosError(err) && err.response) {
    res.status(err.response.status).json(err.response.data);
    return;
  }

  res.status(502).json({ error: "No se pudo conectar con AzuraCast" });
}

export default router;
