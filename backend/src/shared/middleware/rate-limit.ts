import type { NextFunction, Request, Response } from "express";
import { getClientIp } from "../../modules/devices/geoip.service";

interface WindowState {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
}

const MAX_TRACKED_KEYS = 5_000;

function clientKey(req: Request): string {
  return getClientIp(req) ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * Minimal fixed-window rate limiter keyed by the public client IP. It is kept in
 * process memory on purpose: the backend runs as a single instance and the goal
 * is to slow down enumeration and abuse of the public prayer endpoints, not to
 * be a distributed quota system.
 */
export function createRateLimiter({ windowMs, max, message }: RateLimitOptions) {
  const windows = new Map<string, WindowState>();

  function pruneExpired(now: number): void {
    if (windows.size < MAX_TRACKED_KEYS) return;
    for (const [key, state] of windows) {
      if (state.resetAt <= now) windows.delete(key);
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    pruneExpired(now);

    const key = clientKey(req);
    const state = windows.get(key);

    if (!state || state.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (state.count >= max) {
      res.setHeader("Retry-After", String(Math.ceil((state.resetAt - now) / 1000)));
      res.status(429).json({ error: message });
      return;
    }

    state.count += 1;
    next();
  };
}
