import { Router, type Request, type Response } from "express";
import { readMaintenanceStatus } from "./maintenance.service";

/** Public on purpose: the listener reads it before the station renders. */
const router = Router();

/**
 * GET /api/maintenance
 * One question, one answer. The response is never cached: a cached "enabled"
 * would keep the screen up after the operator turned it off, and a cached
 * "disabled" would keep the site serving through the maintenance window.
 */
router.get("/", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(readMaintenanceStatus());
});

export default router;
