import { Router } from "express";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import {
  listPrograms,
  syncProgramsFromSchedule,
  updateProgram,
} from "./programCatalog.service";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";

const router = Router();

const SCHEDULE_DAYS_FORWARD = 7;
const SCHEDULE_TIMEOUT_MS = 15_000;

/** Full week of the station schedule, same window the app shows users. */
async function fetchScheduleForSync(): Promise<unknown[]> {
  const start = new Date();
  const end = new Date(start.getTime() + SCHEDULE_DAYS_FORWARD * 86_400_000);

  const { data } = await azuracastApi.get(`/station/${STATION_ID}/schedule`, {
    params: { start: start.toISOString(), end: end.toISOString() },
    timeout: SCHEDULE_TIMEOUT_MS,
  });
  return Array.isArray(data) ? data : [];
}

router.get(
  "/",
  requireAuth,
  requirePermission("devices"),
  asyncHandler(async (_req, res) => {
    res.status(200).json(await listPrograms());
  })
);

router.post(
  "/sync",
  requireAuth,
  requirePermission("devices"),
  asyncHandler(async (_req, res) => {
    try {
      const schedule = await fetchScheduleForSync();
      const titles = await syncProgramsFromSchedule(schedule);
      res.status(200).json({ ok: true, titles });
    } catch (err) {
      logger.error("NotificationPrograms", "Schedule sync failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError(502, "No se pudo leer la programación de AzuraCast");
    }
  })
);

router.put(
  "/:id",
  requireAuth,
  requirePermission("devices"),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const notifiable = typeof body.notifiable === "boolean" ? body.notifiable : undefined;
    const isDefault = typeof body.isDefault === "boolean" ? body.isDefault : undefined;

    if (notifiable === undefined && isDefault === undefined) {
      throw new AppError(400, "Nada que actualizar: envía notifiable o isDefault");
    }
    if (isDefault === true && notifiable === false) {
      throw new AppError(400, "Un programa predeterminado debe ser notificable");
    }

    try {
      res.status(200).json(await updateProgram(String(req.params.id), { notifiable, isDefault }));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2025") throw new AppError(404, "Programa no encontrado");
      throw err;
    }
  })
);

export default router;
