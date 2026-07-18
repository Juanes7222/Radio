import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const azApi = axios.create({
    baseURL: `${config.azuracast.url}/api`,
    headers: { 'Authorization': `Bearer ${config.azuracast.apiKey}` }
});

const STATION_ID = config.azuracast.stationId;

interface MediaItem {
    id: number;
    unique_id: string;
    song_id: string;
    title: string;
}

interface FileRecord {
    type: string;
    path: string;
    media: MediaItem | null;
    timestamp: number;
}

interface HistoryRecord {
    song: {
        id: string;
    };
}

export async function cleanupNewsFolder(): Promise<void> {
    const folderPath = config.azuracast.newsFolderPath;
    
    if (!folderPath) {
        logger.warn('FolderCleanup', 'No news folder path configured, skipping cleanup');
        return;
    }

    try {
        logger.info('FolderCleanup', 'Starting cleanup', { folderPath });
        
        const files = await fetchDirectoryFiles(folderPath);

        if (files.length === 0) {
            logger.info('FolderCleanup', 'Folder is empty, nothing to clean');
            return;
        }

        const oldestFileTimestamp = Math.min(...files.map((file) => file.timestamp));
        const playedSongIds = await fetchPlayedSongIds(new Date(oldestFileTimestamp * 1000));

        logger.info('FolderCleanup', 'Fetched played song IDs', { count: playedSongIds.size });
        logger.info('FolderCleanup', 'Fetched files from folder', { firstFile: files[0], totalFiles: files.length });

        const filesToRemove = getPlayedFiles(files, playedSongIds);
        logger.info('FolderCleanup', 'Identified files to remove', { count: filesToRemove.length });

        if (filesToRemove.length === 0) {
            logger.info('FolderCleanup', 'No played files found, nothing to clean');
            return;
        }

        logger.info('FolderCleanup', 'Found played files to remove', { 
            count: filesToRemove.length,
            totalFiles: files.length 
        });

        await deleteFiles(filesToRemove);

    } catch (error: any) {
        logger.error('FolderCleanup', 'Failed to cleanup folder', { 
            error: error.message,
            folderPath 
        });
        throw error;
    }
}

async function fetchDirectoryFiles(directory: string): Promise<FileRecord[]> {
    const response = await azApi.get<FileRecord[]>(
        `/station/${STATION_ID}/files/list`,
        { 
            params: {
                currentDirectory: directory,
                flushCache: false
            },
            timeout: 90_000
        }
    );
    console.log('Fetched files from directory:', response.data);
    return response.data || [];
}

async function fetchPlayedSongIds(since: Date): Promise<Set<string>> {
    const response = await azApi.get<HistoryRecord[]>(
        `/station/${STATION_ID}/history`,
        {
            params: {
                start: since.toISOString(),
                end: new Date().toISOString()
            },
            timeout: 90_000
        }
    );
    return new Set(response.data.map((record) => record.song.id));
}

function getPlayedFiles(files: FileRecord[], playedSongIds: Set<string>): FileRecord[] {
    return files.filter((file) =>
        file.type === 'file' &&
        file.media?.song_id !== undefined &&
        playedSongIds.has(file.media.song_id)
    );
}

async function deleteFiles(files: FileRecord[]): Promise<void> {
    let removedCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
        const media = file.media!;
        try {
            await azApi.delete(
                `/station/${STATION_ID}/file/${media.unique_id}`,
                { timeout: 90_000 }
            );
            
            logger.info('FolderCleanup', 'Removed file', { 
                fileId: media.id, 
                title: media.title
            });
            removedCount++;
        } catch (error: any) {
            logger.error('FolderCleanup', 'Failed to remove file', { 
                fileId: media.id,
                title: media.title,
                error: error.message
            });
            errorCount++;
        }
    }

    logger.info('FolderCleanup', 'Cleanup complete', { 
        removedCount, 
        errorCount, 
        totalAttempted: files.length 
    });
}