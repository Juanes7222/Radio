import { registerNightlyJob } from "../modules/locutor/nightly.job";
import { registerHourlyJob } from "../modules/locutor/hourly.job";
import { registerFolderCleanupJob } from "../modules/azuracast/cleanup/folderCleanup.job";
import { registerPlaybackJob } from "../modules/locutor/playback.job";
import { registerJobRecovery } from "../modules/workers/jobRecovery.job";
import { logger } from "../shared/logger/logger";

export function startScheduler() {
  registerNightlyJob();
  registerHourlyJob();
  registerFolderCleanupJob();
  registerPlaybackJob();
  registerJobRecovery();
  logger.info(
    "Scheduler",
    "Jobs registered: Nightly (2:30 AM), Hourly Check (:45), Folder Cleanup (07:00, 13:00, 19:00), Playback (random announcements in safe hours), Job Recovery (every 5 min)"
  );
}
