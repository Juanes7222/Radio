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

        const playedSongIds = await fetchPlayedSongIds();
        const filesToRemove = getPlayedFiles(files, playedSongIds);

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
    return response.data || [];
}

async function fetchPlayedSongIds(): Promise<Set<string>> {
    // You must implement a call to the /station/{station_id}/history endpoint here
    // and extract the song_id of each played track into a Set for fast lookup.
    return new Set<string>();
}

function getPlayedFiles(files: FileRecord[], playedSongIds: Set<string>): FileRecord[] {
    return files.filter(file => 
        file.type === 'media' && 
        file.media && 
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