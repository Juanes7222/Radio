import { Router, type Request, type Response } from "express";
import { requireAuth, requireSuperAdmin } from "../auth/auth.middleware";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import {
  getBackupLog,
  getBackupStatus,
  getRunState,
  isBackupRunning,
  listBackups,
  triggerBackup,
} from "./backups.service";
import { logger } from "../../shared/logger/logger";

const router = Router();

// Backup management is superadmin-only: it exposes full database copies
// and can execute a server-side script.
router.use(requireAuth, requireSuperAdmin);

/**
 * GET /admin-api/backups
 * Last run status, current manual run state and retained bundles.
 */
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const [status, backups] = await Promise.all([getBackupStatus(), listBackups()]);
    res.json({ status, run: getRunState(), backups });
  })
);

/**
 * GET /admin-api/backups/log?lines=200
 * Tail of the backup run log.
 */
router.get(
  "/log",
  asyncHandler(async (req: Request, res: Response) => {
    const raw = parseInt(String(req.query.lines ?? 200), 10);
    const lines = Number.isNaN(raw) ? 200 : Math.min(Math.max(raw, 1), 500);
    res.json({ lines: await getBackupLog(lines) });
  })
);

/**
 * POST /admin-api/backups/run
 * Starts scripts/radio-backup.sh in the background.
 */
router.post(
  "/run",
  asyncHandler(async (req: Request, res: Response) => {
    if (isBackupRunning()) {
      throw new AppError(409, "Ya hay un backup en ejecución");
    }
    try {
      triggerBackup(req.session?.email ?? null);
    } catch {
      logger.error("BackupsRoutes", "triggerBackup failed: script missing");
      throw new AppError(503, "El script de backup no está disponible en este servidor");
    }
    res.status(202).json({ ok: true, status: "running" });
  })
);

export default router;
