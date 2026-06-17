import { registerNightlyJob } from './nightly.job';
import { registerHourlyJob } from './hourly.job';
// import { registerPlaylistCleanupJob } from './playlistCleanup.job';
import { registerFolderCleanupJob } from './folderCleanup.job';
import { registerPlaybackJob } from './playback.job';
import { registerJobRecovery } from './jobRecovery';

export function startScheduler() {
    registerNightlyJob();
    registerHourlyJob();
    // registerPlaylistCleanupJob();
    registerFolderCleanupJob();
    registerPlaybackJob();
    registerJobRecovery();
    console.log('[Scheduler] Jobs registrados: Nightly (2:30 AM), Hourly Check (:45), Playlist Cleanup (07:00, 14:00, 19:00), Playback (:00), Job Recovery (cada 5 min)');
    console.log('[Scheduler] Nightly job now uses Prisma and intelligent time-slot planning.');
}