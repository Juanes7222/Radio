import { Router } from "express";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { requireAuth } from "./auth.middleware";
import { authenticateGoogleCredential } from "./auth.service";

const router = Router();

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 30;
const loginAttempts = new Map<string, number[]>();

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (loginAttempts.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  hits.push(now);
  loginAttempts.set(ip, hits);
  if (loginAttempts.size > 1000) {
    const oldest = [...loginAttempts.keys()][0];
    loginAttempts.delete(oldest);
  }
  return hits.length > LOGIN_MAX_ATTEMPTS;
}

/**
 * POST /admin-api/auth/google
 * Verifies a Firebase ID token, checks the AdminUser table and
 * returns a session JWT for the admin panel.
 */
router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (isLoginRateLimited(ip)) {
      throw new AppError(429, "Demasiados intentos, espera unos minutos");
    }

    const { credential } = req.body as { credential?: string };
    if (!credential || typeof credential !== "string") {
      throw new AppError(400, "Falta el token de Firebase");
    }

    const session = await authenticateGoogleCredential(credential);
    res.json({ token: session.token, user: session.user });
  })
);

/**
 * GET /admin-api/auth/me
 * Returns the information of the authenticated user.
 */
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.session });
});

/**
 * POST /admin-api/auth/logout
 * The JWT is invalidated client-side; this endpoint exists for consistency.
 */
router.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

export default router;
