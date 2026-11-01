import { unlink } from "fs/promises";
import { prisma } from "../../infrastructure/database/prisma";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { logger } from "../../shared/logger/logger";

/**
 * Purga del banco de audio anterior.
 *
 * El planificador nuevo sintetiza y emite en el mismo momento, así que el banco
 * pre-generado ya no se reproduce: solo ocupa disco y llena la biblioteca de
 * AzuraCast. Borrarlo es destructivo y por eso no es automático; el operador lo
 * pide desde el panel, sabiendo que se van los archivos, las filas y la
 * playlist huérfana.
 *
 * Cada paso es independiente y best-effort: si AzuraCast no responde, las filas
 * y los archivos locales se borran igual y el resultado dice qué falló. Un
 * archivo que no se pudo borrar se queda en disco sin fila que lo apunte, que
 * es inerte.
 */

const LOG = "AudioBankPurge";

/** Carpeta de la biblioteca de AzuraCast donde se subieron las locuciones. */
const LOCUTORES_FOLDER = "locutores";

/** La playlist que el sistema viejo creaba y que quedó deshabilitada. */
const ORPHAN_PLAYLIST_PATTERN = /^avisos?\s+de\s+hora$/i;

const AZURACAST_TIMEOUT_MS = 90_000;

export interface AudioBankPurgeResult {
  rowsDeleted: number;
  localFilesRemoved: number;
  localFilesFailed: number;
  azuracastFilesRemoved: number;
  azuracastFilesFailed: number;
  playlistRemoved: string | null;
  playlistWarning: string | null;
}

interface AzuracastFileRecord {
  type: string;
  media: { unique_id: string; title?: string } | null;
}

interface AzuracastPlaylistRecord {
  id: number;
  name: string;
}

export async function purgeAudioBank(): Promise<AudioBankPurgeResult> {
  const rows = await prisma.generatedAudio.findMany({ select: { id: true, filepath: true } });

  // Las filas primero, igual que en el borrado normal: una fila sin archivo
  // rompe la reutilización, mientras que un archivo sin fila solo ocupa disco.
  if (rows.length > 0) {
    await prisma.generatedAudio.deleteMany();
  }

  const localRemovals = await Promise.all(rows.map((row) => removeFile(row.filepath)));

  const azuracastFiles = await removeAzuracastFiles();
  const playlist = await removeOrphanPlaylist();

  const result: AudioBankPurgeResult = {
    rowsDeleted: rows.length,
    localFilesRemoved: localRemovals.filter(Boolean).length,
    localFilesFailed: localRemovals.filter((ok) => !ok).length,
    azuracastFilesRemoved: azuracastFiles.removed,
    azuracastFilesFailed: azuracastFiles.failed,
    playlistRemoved: playlist.removed,
    playlistWarning: playlist.warning,
  };

  logger.warn(LOG, "Audio bank purged from the panel", result);

  return result;
}

async function removeFile(filepath: string): Promise<boolean> {
  try {
    await unlink(filepath);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // A file that is already gone is a success for the purge, not a failure.
    if (code === "ENOENT") return true;

    logger.warn(LOG, "Could not remove a local audio file", { filepath, error: String(error) });
    return false;
  }
}

/** Files uploaded under `locutores`; the folder is the system's own thumbprint. */
async function removeAzuracastFiles(): Promise<{ removed: number; failed: number }> {
  let files: AzuracastFileRecord[];

  try {
    const response = await azuracastApi.get<AzuracastFileRecord[]>(
      `/station/${STATION_ID}/files/list`,
      {
        params: { currentDirectory: LOCUTORES_FOLDER, flushCache: false },
        timeout: AZURACAST_TIMEOUT_MS,
      }
    );
    files = response.data ?? [];
  } catch (error) {
    logger.warn(LOG, "Could not list the AzuraCast folder", {
      folder: LOCUTORES_FOLDER,
      error: error instanceof Error ? error.message : String(error),
    });
    return { removed: 0, failed: 0 };
  }

  let removed = 0;
  let failed = 0;

  for (const file of files) {
    const media = file.media;
    if (file.type !== "media" || !media) continue;

    try {
      await azuracastApi.delete(`/station/${STATION_ID}/file/${media.unique_id}`, {
        timeout: AZURACAST_TIMEOUT_MS,
      });
      removed += 1;
    } catch (error) {
      failed += 1;
      logger.warn(LOG, "Could not remove an AzuraCast file", {
        uniqueId: media.unique_id,
        title: media.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { removed, failed };
}

/**
 * Deleted by name because the id was never stored anywhere: the old code left
 * the playlist behind and the design only records that it exists. When it is
 * not there, that is the normal state of a station that never ran the old job.
 */
async function removeOrphanPlaylist(): Promise<{ removed: string | null; warning: string | null }> {
  let playlists: AzuracastPlaylistRecord[];

  try {
    const response = await azuracastApi.get<AzuracastPlaylistRecord[]>(
      `/station/${STATION_ID}/playlists`,
      { timeout: AZURACAST_TIMEOUT_MS }
    );
    playlists = response.data ?? [];
  } catch (error) {
    return {
      removed: null,
      warning: `No se pudieron leer las playlists: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const orphan = playlists.find((playlist) => ORPHAN_PLAYLIST_PATTERN.test(playlist.name.trim()));
  if (!orphan) {
    return { removed: null, warning: null };
  }

  try {
    await azuracastApi.delete(`/station/${STATION_ID}/playlist/${orphan.id}`, {
      timeout: AZURACAST_TIMEOUT_MS,
    });
    return { removed: orphan.name, warning: null };
  } catch (error) {
    return {
      removed: null,
      warning: `No se pudo borrar la playlist "${orphan.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
