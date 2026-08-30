import { Router } from "express";
import { config } from "../../config";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { requireAuth } from "./auth.middleware";
import { createAdminSession, fetchStationName, verifyFirebaseCredential } from "./auth.service";

const router = Router();

/**
 * POST /admin-api/auth/google
 * Verifies a Firebase ID token, checks the admin whitelist and
 * returns a session JWT for the admin panel.
 */
router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const { credential } = req.body as { credential?: string };
    if (!credential) {
      throw new AppError(400, "Firebase token is required");
    }

    const profile = await verifyFirebaseCredential(credential);

    if (!config.whitelist.includes(profile.email.toLowerCase())) {
      throw new AppError(403, "Your account does not have access to the admin panel.");
    }

    const stationName = await fetchStationName();
    const session = createAdminSession(profile, stationName);
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
