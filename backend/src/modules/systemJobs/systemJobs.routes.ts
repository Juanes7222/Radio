import { Router } from "express";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { isSystemJobKey } from "./systemJobs.registry";
import { isJobRunning, listSystemJobs, triggerSystemJob } from "./systemJobs.service";

const router = Router();

router.use(requireAuth, requirePermission("jobs"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ jobs: listSystemJobs() });
  })
);

router.post(
  "/:key/run",
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    if (!isSystemJobKey(key)) {
      throw new AppError(404, "Job no encontrado");
    }
    if (isJobRunning(key)) {
      throw new AppError(409, "El job ya está en ejecución");
    }
    const triggeredBy = req.session?.email ?? null;
    triggerSystemJob(key, triggeredBy);
    res.status(202).json({ ok: true, key, status: "running" });
  })
);

export default router;
