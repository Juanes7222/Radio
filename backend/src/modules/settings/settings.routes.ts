import { Router, type Request, type Response } from "express";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { AppError } from "../../shared/errors/app-error";
import { asyncHandler } from "../../shared/errors/async-handler";
import { logger } from "../../shared/logger/logger";
import {
  applyPatch,
  listChanges,
  readSettings,
  resetKeys,
} from "./settings.service";

/**
 * Admin API for the station settings. Every route answers with the effective
 * value and its source, so the panel can tell a stored value from one the
 * environment still provides.
 *
 * Not listed in `SILENT_LOG_PATHS`: the page does not poll itself, so each save
 * is worth the line it writes in the log the panel reads.
 */
export const settingsRouter = Router();

settingsRouter.use(requireAuth, requirePermission("settings"));

const CHANGES_DEFAULT_LIMIT = 50;
const CHANGES_MAX_LIMIT = 200;

/**
 * GET /admin-api/settings
 * The whole catalog, grouped by section.
 */
settingsRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ sections: await readSettings() });
  })
);

/**
 * PUT /admin-api/settings
 * Partial save: only the keys present in the body are written. Answers with the
 * full view so the panel does not have to reload after a save.
 */
settingsRouter.put(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const patch = asPlainObject(req.body);
    if (!patch) {
      throw new AppError(400, "El cuerpo debe ser un objeto con los ajustes a guardar.");
    }

    const { applied } = await applyPatch(patch, actorEmail(req));

    res.json({ applied, sections: await readSettings() });
  })
);

/**
 * POST /admin-api/settings/reset
 * Drops the stored rows of the given keys so they fall back to the environment
 * or to the catalog default.
 */
settingsRouter.post(
  "/reset",
  asyncHandler(async (req: Request, res: Response) => {
    const body = asPlainObject(req.body);
    if (!body) {
      throw new AppError(400, 'El cuerpo debe tener la forma { "keys": ["..."] }.');
    }

    const { keys } = body;
    if (!isStringArray(keys)) {
      throw new AppError(400, '"keys" debe ser una lista de claves de ajuste.');
    }

    const { cleared } = await resetKeys(keys, actorEmail(req));

    res.json({ cleared, sections: await readSettings() });
  })
);

/**
 * GET /admin-api/settings/changes
 * The change log, newest first.
 */
settingsRouter.get(
  "/changes",
  asyncHandler(async (req: Request, res: Response) => {
    const rows = await listChanges(parseChangesLimit(req.query.limit));

    res.json({ rows });
  })
);

/**
 * The administrator on the request, for the change log. The session middleware
 * always fills it, so a missing email means the guard changed shape and the log
 * would otherwise blame nobody.
 */
function actorEmail(req: Request): string {
  const email = req.session?.email;
  if (email) return email;

  logger.warn("SettingsRoutes", "The request has no administrator email", {
    path: req.originalUrl,
  });
  return "desconocido";
}

/**
 * Rejects anything that is not a plain object, so a body that happens to be an
 * array or `null` is a 400 with a sentence instead of an empty save.
 */
function asPlainObject(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * A positive integer, or a 400: passing `"abc"` or `0` straight to Prisma would
 * either fail deep inside the client or silently answer nothing. A value above
 * the cap is capped rather than rejected, because asking for more of the log is
 * not a mistake worth an error.
 */
function parseChangesLimit(raw: unknown): number {
  if (raw === undefined) return CHANGES_DEFAULT_LIMIT;

  const text = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d+$/.test(text) || Number(text) < 1) {
    throw new AppError(400, `"limit" debe ser un número entero positivo.`);
  }

  return Math.min(Number(text), CHANGES_MAX_LIMIT);
}
