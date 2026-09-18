import { Router, type Request, type Response } from "express";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { asyncHandler } from "../../shared/errors/async-handler";
import {
  runHealthCycle,
  getHealthOverview,
  getHealthStatusSnapshot,
} from "./health.service";

/**
 * Admin watchdog API. Mounted at /admin-api/health/watchdog so it never
 * shadows the plain liveness endpoint at /admin-api/health.
 */
export const healthAdminRouter = Router();

healthAdminRouter.use(requireAuth, requirePermission("dashboard"));

/**
 * GET /admin-api/health/watchdog
 * Full health overview: per-check status, open alerts and recent actions.
 */
healthAdminRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getHealthOverview());
  })
);

/**
 * POST /admin-api/health/watchdog/run
 * Forces an immediate watchdog cycle instead of waiting for the cron tick.
 */
healthAdminRouter.post(
  "/run",
  asyncHandler(async (_req: Request, res: Response) => {
    const overview = await runHealthCycle();
    res.json(overview);
  })
);

/**
 * Anonymous aggregate snapshot for the public degraded-state banner.
 * Mounted at /api/health, outside any auth middleware because the public
 * site has no session. Leaks no internal error detail, only the status.
 */
export const healthPublicRouter = Router();

healthPublicRouter.get(
  "/public",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getHealthStatusSnapshot());
  })
);
