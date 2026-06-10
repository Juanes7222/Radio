import { registerNightlyJob } from './nightly.job';
import { registerHourlyJob } from './hourly.job';
import { registerPlaylistCleanupJob } from './playlistCleanup.job';
import { subscribeToAllConfiguredChannels } from '../services/youtube/subscription.service';

export function startScheduler() {
    registerNightlyJob();
    registerHourlyJob();
    registerPlaylistCleanupJob();
    console.log('[Scheduler] Jobs registrados: Nightly (2:30 AM), Hourly Check (:45), Playlist Cleanup (07:00, 14:00, 19:00)');
}