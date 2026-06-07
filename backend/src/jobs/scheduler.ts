import { registerNightlyJob } from './nightly.job';
import { registerHourlyJob } from './hourly.job';
import { subscribeToAllConfiguredChannels } from '../services/youtube/subscription.service';

export async function startScheduler() {
    registerNightlyJob();
    registerHourlyJob();
    await subscribeToAllConfiguredChannels();
    console.log('[Scheduler] Jobs registrados: Nightly (2:30 AM), Hourly Check (:45)');
}