import { Router, type Request, type Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import { asyncHandler } from "../../shared/errors/async-handler";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import {
  createChannel,
  deleteChannel,
  isYoutubeChannelCategory,
  listChannels,
  resubscribeChannel,
} from "./channel.service";

const router = Router();

router.use(requireAuth, requirePermission("youtube"));

router.get(
  "/channels",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ channels: await listChannels() });
  })
);

router.post(
  "/channels",
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const category = body.category ?? "GENERAL";

    if (typeof category !== "string" || !isYoutubeChannelCategory(category)) {
      throw new AppError(400, "La categoría debe ser GENERAL o NEWS.");
    }

    res.status(201).json(
      await createChannel({
        channelId: typeof body.channelId === "string" ? body.channelId : "",
        title: typeof body.title === "string" ? body.title : "",
        category,
      })
    );
  })
);

router.delete(
  "/channels/:channelId",
  asyncHandler(async (req: Request, res: Response) => {
    await deleteChannel(String(req.params.channelId));
    res.status(204).end();
  })
);

router.post(
  "/channels/:channelId/resubscribe",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await resubscribeChannel(String(req.params.channelId)));
  })
);

export default router;