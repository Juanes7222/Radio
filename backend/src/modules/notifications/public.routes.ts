import { Router } from "express";
import { listDefaultTitles, listNotifiableTitles } from "./programCatalog.service";

const router = Router();

/**
 * Public catalog for the mobile app: which programs can be subscribed for
 * reminders and which come pre-selected. Titles are exact AzuraCast titles;
 * the app normalizes them before comparing.
 */
router.get("/", async (_req, res) => {
  const [notifiable, defaults] = await Promise.all([
    listNotifiableTitles(),
    listDefaultTitles(),
  ]);

  res.status(200).json({
    notifiable,
    defaults: defaults.filter((title) => notifiable.includes(title)),
  });
});

export default router;
