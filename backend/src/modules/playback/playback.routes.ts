import { Router } from "express";
import { asyncHandler } from "../../shared/errors/async-handler";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import {
  listPlaybackAudios,
  listPlaybackEvents,
  listPlaybackPlaylists,
  parseOrder,
  parsePlaybackQuery,
} from "./playback.service";

const router = Router();

router.use(requireAuth);

// GET /admin-api/playback/log?from&to&playlist&search&automated&page&limit
router.get(
  "/log",
  requirePermission("dashboard"),
  asyncHandler(async (req, res) => {
    const parsed = parsePlaybackQuery(req.query as Record<string, unknown>);
    res.json(await listPlaybackEvents(parsed));
  })
);

// GET /admin-api/playback/audios?from&to&playlist&search&page&limit&order
router.get(
  "/audios",
  requirePermission("dashboard"),
  asyncHandler(async (req, res) => {
    const parsed = parsePlaybackQuery(req.query as Record<string, unknown>);
    res.json(await listPlaybackAudios(parsed, parseOrder(req.query.order)));
  })
);

// GET /admin-api/playback/filters
router.get(
  "/filters",
  requirePermission("dashboard"),
  asyncHandler(async (_req, res) => {
    res.json({ playlists: await listPlaybackPlaylists() });
  })
);

export default router;