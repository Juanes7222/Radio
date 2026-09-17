import { Router, type Request, type Response } from "express";
import axios from "axios";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { asyncHandler } from "../../shared/errors/async-handler";
import { runHealthCycle, getHealthOverview, getHealthStatusSnapshot } from "./health.service";

const router = Router();

router.use(requireAuth, requirePermission("dashboard"));

/**
 * GET /admin-api/health
 * Full health overview: per-check status, open alerts and recent actions.
 */
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getHealthOverview());
  })
);

/**
 * POST /admin-api/health/run
 * Forces an immediate watchdog cycle instead of waiting for the cron tick.
 */
router.post(
  "/run",
  asyncHandler(async (_req: Request, res: Response) => {
    const overview = await runHealthCycle();
    res.json(overview);
  })
);

/**
 * GET /public-health (mounted at /api/health)
 * Minimal anonymous snapshot for the public degraded-state banner.
 * No internal error detail is leaked, only the aggregate status.
 */
router.get(
  "/public",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getHealthStatusSnapshot());
  })
);

export default router;
