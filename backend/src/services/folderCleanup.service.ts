import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const azApi = axios.create({
    baseURL: `${config.azuracast.url}/api`,
    headers: { 'Authorization': `Bearer ${config.azuracast.apiKey}` }
});

const STATION = config.azuracast.stationId;

interface MediaItem {
    id: number;
    unique_id: string;
    title: string;
    last_played_at: string | null;
    play_count: number;
}

interface FileRecord {
    is_dir: boolean;
    path: string;
    media: MediaItem | null;
}

/**
 * Cleans up played media files from the designated directory in AzuraCast.
 */
export async function cleanupNewsFolder(): Promise<void> {
    const folderPath = config.azuracast.newsFolderPath;
    if (!folderPath) {
        logger.warn('FolderCleanup', 'No news folder path configured, skipping cleanup');
        return;
    }

    try {
        logger.info('FolderCleanup', 'Starting cleanup', { folderPath });
        
        const { data: files } = await azApi.get<FileRecord[]>(
            `/station/${STATION}/files`,
            { 
                params: { currentDirectory: folderPath },
                timeout: 30_000 
            }
        );

        if (!files || files.length === 0) {
            logger.info('FolderCleanup', 'Folder is empty, nothing to clean');
            return;
        }

        const playedFiles = files.filter(item => {
            if (item.is_dir || !item.media) {
                return false;
            }
            return item.media.last_played_at !== null || item.media.play_count > 0;
        });

        if (playedFiles.length === 0) {
            logger.info('FolderCleanup', 'No played files found, nothing to clean');
            return;
        }

        logger.info('FolderCleanup', 'Found played files to remove', { 
            count: playedFiles.length,
            totalFiles: files.length 
        });

        let removed = 0;
        let errors = 0;
        
        for (const item of playedFiles) {
            const media = item.media!;
            try {
                await azApi.delete(
                    `/station/${STATION}/file/${media.unique_id}`,
                    { timeout: 15_000 }
                );
                logger.info('FolderCleanup', 'Removed file', { 
                    fileId: media.id, 
                    title: media.title,
                    lastPlayed: media.last_played_at,
                    playCount: media.play_count
                });
                removed++;
            } catch (err: any) {
                logger.error('FolderCleanup', 'Failed to remove file', { 
                    fileId: media.id,
                    title: media.title,
                    error: err.message
                });
                errors++;
            }
        }

        logger.info('FolderCleanup', 'Cleanup complete', { removed, errors, totalChecked: playedFiles.length });

    } catch (err: any) {
        logger.error('FolderCleanup', 'Failed to cleanup folder', { 
            error: err.message,
            folderPath 
        });
        throw err;
    }
}