import { Router, type Request, type Response } from "express";
import { logger } from "../../shared/logger/logger";
import { createFeedback } from "./feedback.service";
import { validateFeedbackSubmission } from "./feedback.validation";

const router = Router();

/**
 * POST /api/feedback
 * Public, no auth. A listener writes an opinion, a suggestion, a question or a
 * problem report. The name and the contact are optional: writing is allowed
 * without giving any data, which is the promise the page makes in its copy.
 */
router.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const validation = validateFeedbackSubmission(body);

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const entry = await createFeedback(validation.data);

    res.status(201).json({
      id: entry.id,
      categoria: entry.categoria,
      createdAt: entry.createdAt,
    });
  } catch (err) {
    logger.error("FeedbackRoutes", "Error creating feedback message", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Error al guardar el mensaje" });
  }
});

export default router;