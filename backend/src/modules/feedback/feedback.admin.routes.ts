import { Router, type Request, type Response } from "express";
import type { FeedbackCategory, FeedbackStatus } from "@radio/types";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { logger } from "../../shared/logger/logger";
import {
  deleteFeedback,
  listFeedback,
  markFeedbackRead,
  setFeedbackStatus,
} from "./feedback.service";
import {
  isFeedbackCategory,
  isFeedbackStatus,
  validatePagination,
} from "./feedback.validation";

const router = Router();

router.use(requireAuth, requirePermission("feedback"));

function optionalQueryFilter<T>(
  value: unknown,
  isValid: (raw: unknown) => raw is T
): T | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isValid(trimmed) ? trimmed : null;
}

/**
 * GET /admin-api/feedback
 * Paginated inbox with status counts and an unread counter.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { page, limit, skip } = validatePagination(
      req.query as Record<string, unknown>
    );
    const estado = optionalQueryFilter<FeedbackStatus>(
      req.query.estado,
      isFeedbackStatus
    );
    const categoria = optionalQueryFilter<FeedbackCategory>(
      req.query.categoria,
      isFeedbackCategory
    );
    const search =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search.trim()
        : null;

    const result = await listFeedback(
      { estado, categoria, search },
      { page, limit, skip }
    );

    res.json(result);
  } catch (err) {
    logger.error("FeedbackAdminRoutes", "Error listing feedback", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al obtener los mensajes" });
  }
});

/**
 * PUT /admin-api/feedback/:id
 * Moves a message between pending, resolved and discarded.
 */
router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { estado } = req.body as { estado?: unknown };

  if (!isFeedbackStatus(estado)) {
    res.status(400).json({ error: "Estado invalido" });
    return;
  }

  try {
    const entry = await setFeedbackStatus(String(id), estado);
    res.json(entry);
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "P2025") {
      res.status(404).json({ error: "Mensaje no encontrado" });
      return;
    }
    logger.error("FeedbackAdminRoutes", "Error updating feedback status", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al actualizar el estado" });
  }
});

/**
 * POST /admin-api/feedback/:id/read
 * Stamps the read flag once. Repeating it does not move the timestamp.
 */
router.post("/:id/read", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const entry = await markFeedbackRead(String(id));
    res.json(entry);
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "P2025") {
      res.status(404).json({ error: "Mensaje no encontrado" });
      return;
    }
    logger.error("FeedbackAdminRoutes", "Error marking feedback as read", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al marcar como leido" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await deleteFeedback(String(id));
    res.status(204).end();
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "P2025") {
      res.status(404).json({ error: "Mensaje no encontrado" });
      return;
    }
    logger.error("FeedbackAdminRoutes", "Error deleting feedback", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al eliminar el mensaje" });
  }
});

export default router;