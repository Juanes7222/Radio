import cron from 'node-cron';
import { cleanupNewsPlaylist } from '../services/playlistCleanup.service';
import { config } from '../config';
import { logger } from '../utils/logger';

const CLEANUP_SCHEDULES = [
    { time: '0 7 * * *', label: '07:00 AM' },
    { time: '0 14 * * *', label: '02:00 PM' },
    { time: '0 19 * * *', label: '07:00 PM' },
];

export function registerPlaylistCleanupJob() {
    for (const schedule of CLEANUP_SCHEDULES) {
        cron.schedule(schedule.time, async () => {
            logger.info('PlaylistCleanupJob', `Starting scheduled cleanup at ${schedule.label}`);
            try {
                await cleanupNewsPlaylist();
                logger.info('PlaylistCleanupJob', `Scheduled cleanup completed at ${schedule.label}`);
            } catch (err: any) {
                logger.error('PlaylistCleanupJob', `Scheduled cleanup failed at ${schedule.label}`, {
                    error: err.message
                });
            }
        }, { timezone: config.locutor.timezone });
        
        logger.info('PlaylistCleanupJob', `Registered cleanup job at ${schedule.label}`);
    }
}
