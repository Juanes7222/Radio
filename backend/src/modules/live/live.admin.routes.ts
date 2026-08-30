import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getCurrentLiveUrl, notifyLiveEnd } from "./sse.service";

const router = Router();

// All admin live routes require authentication
router.use(requireAuth);

router.get("/status", (_req, res) => {
  const url = getCurrentLiveUrl();
  res.json({ active: url !== null, url });
});

router.post("/clear", (_req, res) => {
  const url = getCurrentLiveUrl();
  if (url === null) {
    res.json({ ok: true, cleared: false, message: "No hay transmisión activa" });
    return;
  }
  notifyLiveEnd();
  res.json({ ok: true, cleared: true });
});

export default router;
