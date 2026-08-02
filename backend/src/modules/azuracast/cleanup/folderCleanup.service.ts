import { azuracastApi, STATION_ID } from "../azuracast.client";
import { config } from "../../../config";
import { logger } from "../../../shared/logger/logger";

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

const DIRECTORY_TIMEOUT_MS = 90_000;

export async function cleanupNewsFolder(): Promise<void> {
  const folderPath = config.azuracast.newsFolderPath;

  if (!folderPath) {
    logger.warn("FolderCleanup", "No news folder path configured, skipping cleanup");
    return;
  }

  try {
    logger.info("FolderCleanup", "Starting cleanup", { folderPath });

    const files = await fetchDirectoryFiles(folderPath);
    if (files.length === 0) {
      logger.info("FolderCleanup", "Folder is empty, nothing to clean");
      return;
    }

    const oldestFileTimestamp = Math.min(...files.map((file) => file.timestamp));
    const playedSongIds = await fetchPlayedSongIds(new Date(oldestFileTimestamp * 1000));
    logger.info("FolderCleanup", "Fetched played song IDs", { count: playedSongIds.size });

    const filesToRemove = getPlayedFiles(files, playedSongIds);
    if (filesToRemove.length === 0) {
      logger.info("FolderCleanup", "No played files found, nothing to clean");
      return;
    }

    logger.info("FolderCleanup", "Found played files to remove", {
      count: filesToRemove.length,
      totalFiles: files.length,
    });

    await deleteFiles(filesToRemove);
  } catch (err) {
    logger.error("FolderCleanup", "Failed to cleanup folder", {
      error: err instanceof Error ? err.message : String(err),
      folderPath,
    });
    throw err;
  }
}

async function fetchDirectoryFiles(directory: string): Promise<FileRecord[]> {
  const response = await azuracastApi.get<FileRecord[]>(`/station/${STATION_ID}/files/list`, {
    params: {
      currentDirectory: directory,
      flushCache: false,
    },
    timeout: DIRECTORY_TIMEOUT_MS,
  });
  return response.data || [];
}

async function fetchPlayedSongIds(since: Date): Promise<Set<string>> {
  const response = await azuracastApi.get<HistoryRecord[]>(`/station/${STATION_ID}/history`, {
    params: {
      start: since.toISOString(),
      end: new Date().toISOString(),
    },
    timeout: DIRECTORY_TIMEOUT_MS,
  });
  return new Set(response.data.map((record) => record.song.id));
}

function getPlayedFiles(files: FileRecord[], playedSongIds: Set<string>): FileRecord[] {
  return files.filter(
    (file) =>
      file.type === "media" &&
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
      await azuracastApi.delete(`/station/${STATION_ID}/file/${media.unique_id}`, {
        timeout: DIRECTORY_TIMEOUT_MS,
      });

      logger.info("FolderCleanup", "Removed file", {
        fileId: media.id,
        title: media.title,
      });
      removedCount++;
    } catch (err) {
      logger.error("FolderCleanup", "Failed to remove file", {
        fileId: media.id,
        title: media.title,
        error: err instanceof Error ? err.message : String(err),
      });
      errorCount++;
    }
  }

  logger.info("FolderCleanup", "Cleanup complete", {
    removedCount,
    errorCount,
    totalAttempted: files.length,
  });
}
