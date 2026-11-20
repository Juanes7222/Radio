import { Router, type Request, type Response } from "express";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { readSnapshot } from "./telemetry.service";
import { parseWindowDays } from "./telemetry.utils";

export const telemetryAdminRouter = Router();

// Reads device activity, so it shares the permission of the devices section
// instead of adding a new one to the RBAC catalog for a single read endpoint.
telemetryAdminRouter.get(
  "/",
  requireAuth,
  requirePermission("devices"),
  async (req: Request, res: Response) => {
    try {
      const windowDays = parseWindowDays(req.query.days);
      res.json(await readSnapshot(windowDays));
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }

      logger.error("Telemetry", "Error reading telemetry snapshot", {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "Error al leer la telemetria" });
    }
  }
);
