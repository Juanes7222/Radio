import { registerNightlyJob } from './nightly.job';
import { registerHourlyJob } from './hourly.job';
import { registerPlaylistCleanupJob } from './playlistCleanup.job';
import { registerPlaybackJob } from './playback.job';

export function startScheduler() {
    registerNightlyJob();
    registerHourlyJob();
    registerPlaylistCleanupJob();
    registerPlaybackJob();
    console.log('[Scheduler] Jobs registrados: Nightly (2:30 AM), Hourly Check (:45), Playlist Cleanup (07:00, 14:00, 19:00), Playback (:00)');
    console.log('[Scheduler] Nightly job now uses Prisma and intelligent time-slot planning.');
}