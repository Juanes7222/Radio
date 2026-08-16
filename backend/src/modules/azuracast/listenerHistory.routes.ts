import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getListenerHistory } from "./listenerHistory.service";

const router = Router();

const MIN_HOURS = 1;
const MAX_HOURS = 168; // 7 días

// GET /admin-api/listeners/history?hours=24
router.get("/history", requireAuth, async (req, res) => {
  const rawHours = Number(req.query.hours);
  const hours =
    Number.isFinite(rawHours) && rawHours >= MIN_HOURS && rawHours <= MAX_HOURS
      ? Math.floor(rawHours)
      : 24;

  const rows = await getListenerHistory(hours);
  res.json({ rows });
});

export default router;
