import { Router, type NextFunction, type Request, type Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { recordActivity, recordError } from "./telemetry.service";
import {
  isValidDeviceId,
  normalizeAppVersion,
  normalizeMessage,
  normalizePlatform,
  normalizeStack,
} from "./telemetry.utils";

export const telemetryPublicRouter = Router();

const WRITE_WINDOW_MS = 60_000;
const MAX_OPENS_PER_WINDOW = 20;
const MAX_ERRORS_PER_WINDOW = 20;
const LIMITERS_PURGE_THRESHOLD = 1000;

interface WriteWindow {
  count: number;
  resetAt: number;
}

function respondError(res: Response, err: unknown, context: string): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  logger.error("Telemetry", context, {
    error: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: "Error del servidor" });
}

/**
 * Anti-flood guard for the two public write routes. It is per process, so two
 * instances count separately, which is enough to keep a single app or a script
 * from filling the tables. The device is the key when it is valid because a
 * mobile carrier puts many listeners behind the same CGNAT address.
 */
function createWriteLimiter(maxPerWindow: number) {
  const windows = new Map<string, WriteWindow>();

  function purgeExpired(now: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (windows.size > LIMITERS_PURGE_THRESHOLD) purgeExpired(now);

    const body = req.body as { deviceId?: unknown } | undefined;
    const key = isValidDeviceId(body?.deviceId) ? body.deviceId : (req.ip ?? "unknown");
    const current = windows.get(key);

    if (!current || current.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + WRITE_WINDOW_MS });
      next();
      return;
    }

    if (current.count >= maxPerWindow) {
      res.status(429).json({ error: "Demasiadas solicitudes, intenta más tarde." });
      return;
    }

    current.count += 1;
    next();
  };
}

const openLimiter = createWriteLimiter(MAX_OPENS_PER_WINDOW);
const errorLimiter = createWriteLimiter(MAX_ERRORS_PER_WINDOW);

telemetryPublicRouter.post("/open", openLimiter, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | undefined;

  if (!isValidDeviceId(body?.deviceId)) {
    res.status(400).json({ error: "deviceId invalido" });
    return;
  }

  try {
    await recordActivity({
      deviceId: body.deviceId.trim(),
      appVersion: normalizeAppVersion(body?.appVersion),
      platform: normalizePlatform(body?.platform),
    });
    res.status(204).end();
  } catch (err) {
    respondError(res, err, "Error recording app open");
  }
});

telemetryPublicRouter.post("/error", errorLimiter, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | undefined;

  try {
    await recordError({
      deviceId: isValidDeviceId(body?.deviceId) ? body.deviceId.trim() : null,
      message: normalizeMessage(body?.message),
      stack: normalizeStack(body?.stack),
      appVersion: normalizeAppVersion(body?.appVersion),
      platform: normalizePlatform(body?.platform),
    });
    res.status(204).end();
  } catch (err) {
    respondError(res, err, "Error recording app failure");
  }
});
