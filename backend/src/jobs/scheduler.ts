import { registerNightlyJob } from "../modules/locutor/nightly.job";
import { registerHourlyJob } from "../modules/locutor/hourly.job";
import { registerFolderCleanupJob } from "../modules/azuracast/cleanup/folderCleanup.job";
import { registerPlaybackJob } from "../modules/locutor/playback.job";
import { registerJobRecovery } from "../modules/workers/jobRecovery.job";
import { registerProgramNotifyJob } from "../modules/schedule/programNotify.job";
import { registerListenerSamplingJob } from "../modules/azuracast/listenerHistory.job";
import { registerRotationJob } from "../modules/rotation/rotation.job";
import { registerGeoIpUpdateJob } from "../modules/devices/geoipUpdate.job";
import { registerNoticeMediaCleanupJob } from "../modules/notices/media/media.cleanup.job";
import { logger } from "../shared/logger/logger";

export function startScheduler() {
  registerNightlyJob();
  registerHourlyJob();
  registerFolderCleanupJob();
  registerPlaybackJob();
  registerJobRecovery();
  registerProgramNotifyJob();
  registerListenerSamplingJob();
  registerRotationJob();
  registerGeoIpUpdateJob();
  registerNoticeMediaCleanupJob();
  logger.info(
    "Scheduler",
    "Jobs registered: Nightly (2:30 AM), Hourly Check (:45), Folder Cleanup (07:00, 13:00, 19:00), Playback (random announcements in safe hours), Job Recovery (every 5 min), Program Notify (every 5 min), Listener Sampling (every 5 min), Rotations (3:30 AM), GeoIP Update (Tue/Fri 03:00), Notice Media Cleanup (04:15)"
  );
}
