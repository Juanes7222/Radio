import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const azApi = axios.create({
    baseURL: `${config.azuracast.url}/api`,
    headers: { 'Authorization': `Bearer ${config.azuracast.apiKey}` }
});

const STATION = config.azuracast.stationId;

interface PlaylistItem {
    id: number;
    media: {
        id: number;
        unique_id: string;
        title: string;
        last_played_at: string | null;
        play_count: number;
    };
}

interface PlaylistResponse {
    id: number;
    name: string;
    media_items: PlaylistItem[];
}

export async function cleanupNewsPlaylist(): Promise<void> {
    const playlistId = config.azuracast.newsPlaylistId;
    if (!playlistId) {
        logger.warn('PlaylistCleanup', 'No news playlist ID configured, skipping cleanup');
        return;
    }

    try {
        logger.info('PlaylistCleanup', 'Starting cleanup', { playlistId });
        
        // Obtener la playlist con sus archivos
        const { data: playlist } = await azApi.get<PlaylistResponse>(
            `/station/${STATION}/playlist/${playlistId}`,
            { timeout: 30_000 }
        );

        if (!playlist.media_items || playlist.media_items.length === 0) {
            logger.info('PlaylistCleanup', 'Playlist is empty, nothing to clean');
            return;
        }

        // Filtrar archivos que ya fueron reproducidos
        const playedFiles = playlist.media_items.filter(item => {
            const wasPlayed = item.media.last_played_at !== null || item.media.play_count > 0;
            return wasPlayed;
        });

        if (playedFiles.length === 0) {
            logger.info('PlaylistCleanup', 'No played files found, nothing to clean');
            return;
        }

        logger.info('PlaylistCleanup', 'Found played files to remove', { 
            count: playedFiles.length,
            totalFiles: playlist.media_items.length 
        });

        // Eliminar cada archivo reproducido
        let removed = 0;
        let errors = 0;
        
        for (const item of playedFiles) {
            try {
                await azApi.delete(
                    `/station/${STATION}/file/${item.media.unique_id}`,
                    { timeout: 15_000 }
                );
                logger.info('PlaylistCleanup', 'Removed file', { 
                    fileId: item.media.id, 
                    title: item.media.title,
                    lastPlayed: item.media.last_played_at,
                    playCount: item.media.play_count
                });
                removed++;
            } catch (err: any) {
                logger.error('PlaylistCleanup', 'Failed to remove file', { 
                    fileId: item.media.id,
                    title: item.media.title,
                    error: err.message
                });
                errors++;
            }
        }

        logger.info('PlaylistCleanup', 'Cleanup complete', { removed, errors, totalChecked: playedFiles.length });

    } catch (err: any) {
        logger.error('PlaylistCleanup', 'Failed to cleanup playlist', { 
            error: err.message,
            playlistId 
        });
        throw err;
    }
}
