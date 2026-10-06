import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { logger } from "../../shared/logger/logger";
import { AZURACAST_UPLOAD_TIMEOUT_MS } from "../../shared/constants";

/**
 * One row of a sequential playlist, as returned by
 * GET /station/{id}/playlist/{id}/order.
 */
export interface PlaylistOrderEntry {
  /** Row id of the playlist-media association (used to reorder). */
  id: number;
  weight: number;
    media: {
      id: number;
      unique_id: string;
      path: string;
      title: string;
      artist: string;
      length: number;
      /** Only present when the source is a library folder. */
      album?: string | null;
    };
}

/** Schedule item embedded in the playlist API object. */
export interface PlaylistScheduleItem {
  id?: number;
  /** Minutes since midnight. */
  start_time: number;
  /** Minutes since midnight. */
  end_time: number;
  /** AzuraCast day indices (1=Monday .. 7=Sunday). */
  days: number[];
}

export interface PlaylistDetail {
  id: number;
  name: string;
  type?: string;
  source: string;
  order: string;
  is_enabled?: boolean;
  schedule_items?: PlaylistScheduleItem[];
}

/**
 * Why a playlist cannot host the episodes of a program, or null when it can.
 *
 * A sequential library playlist already drops an item once it has played, so
 * there is no extra flag to require; the only hard requirement is that the
 * playlist is backed by the media library.
 */
export function playlistBlockingReason(playlist: PlaylistDetail): string | null {
  if (playlist.source !== "songs") {
    return `La playlist "${playlist.name}" no está basada en la biblioteca de audio, así que no puede contener los episodios del programa.`;
  }
  if (playlist.is_enabled === false) {
    return `La playlist "${playlist.name}" está deshabilitada, así que sus episodios no se emitirán.`;
  }
  if (playlist.order && playlist.order !== "sequential") {
    return `La playlist "${playlist.name}" está en orden "${playlist.order}" en vez de secuencial: los episodios se emitirán en orden aleatorio.`;
  }
  return null;
}

export interface MediaFileDetail {
  id: number;
  unique_id: string;
  path: string;
  title: string;
  artist: string;
  playlists: Array<{ id: number; name: string }>;
}

export interface StationFileRow {
  id: number;
  unique_id: string;
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  length: number;
}

export interface StationDirectory {
  name: string;
  path: string;
}

const FILES_PER_PAGE = 500;
const MAX_FILE_PAGES = 30;

interface StationFilesPage {
  rows?: StationFileRow[];
  total?: number;
}

async function fetchFilesPage(page: number): Promise<StationFilesPage> {
  const { data } = await azuracastApi.get<StationFilesPage>(
    `/station/${STATION_ID}/files`,
    { params: { per_page: FILES_PER_PAGE, page } }
  );
  return data ?? {};
}

/**
 * Fetches every media file of the station. Used to build the ordered source
 * when the rotation reads from a library folder.
 *
 * AzuraCast answers with the total row count, so the remaining pages are known
 * up front and fetched concurrently instead of one after another. Fetching
 * them in series over a large library took long enough to trip the admin
 * panel's request timeout.
 */
export async function listAllStationFiles(): Promise<StationFileRow[]> {
  const first = await fetchFilesPage(1);
  const firstRows = first.rows ?? [];
  const total = first.total ?? firstRows.length;

  const totalPages = Math.min(Math.ceil(total / FILES_PER_PAGE), MAX_FILE_PAGES);
  if (total > MAX_FILE_PAGES * FILES_PER_PAGE) {
    logger.warn(
      "Rotation",
      "Station library exceeds the page scan limit; the rotation source may be incomplete",
      { total, scanned: MAX_FILE_PAGES * FILES_PER_PAGE }
    );
  }

  if (totalPages <= 1) return firstRows;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchFilesPage(index + 2))
  );

  return [...firstRows, ...remaining.flatMap((page) => page.rows ?? [])];
}

/**
 * Returns the media files contained in a library folder (recursive), sorted
 * by path so the rotation order is stable and predictable.
 */
export async function listMediaInFolder(folderPath: string): Promise<PlaylistOrderEntry[]> {
  const prefix = folderPath.replace(/\/+$/, "");
  const files = await listAllStationFiles();

  return files
    .filter((file) => file.path.startsWith(`${prefix}/`))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file, index) => ({
      id: index + 1,
      weight: index + 1,
      media: {
        id: file.id,
        unique_id: file.unique_id,
        path: file.path,
        title: file.title ?? "",
        artist: file.artist ?? "",
        album: file.album,
        length: file.length,
      },
    }));
}

/** Lists the direct subdirectories of a media library path. */
export async function listDirectories(
  currentDirectory = ""
): Promise<StationDirectory[]> {
  const { data } = await azuracastApi.get<{ rows?: StationDirectory[] }>(
    `/station/${STATION_ID}/files/directories`,
    { params: currentDirectory ? { currentDirectory } : {} }
  );
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function getPlaylistOrder(playlistId: number): Promise<PlaylistOrderEntry[]> {
  const { data } = await azuracastApi.get<PlaylistOrderEntry[]>(
    `/station/${STATION_ID}/playlist/${playlistId}/order`
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Reorders the media of a sequential playlist. The mapping keys are the
 * playlist-media row ids returned by getPlaylistOrder and the values are
 * the new weights (1-based order).
 */
export async function setPlaylistOrder(
  playlistId: number,
  order: Record<number, number>
): Promise<void> {
  await azuracastApi.put(`/station/${STATION_ID}/playlist/${playlistId}/order`, { order });
}

export async function emptyPlaylist(playlistId: number): Promise<void> {
  await azuracastApi.delete(`/station/${STATION_ID}/playlist/${playlistId}/empty`);
}

export async function getFileDetail(mediaId: string | number): Promise<MediaFileDetail> {
  const { data } = await azuracastApi.get<MediaFileDetail>(
    `/station/${STATION_ID}/file/${mediaId}`
  );
  return data;
}

/**
 * Replaces the full playlist membership of a media file. Callers must pass
 * the current playlist ids plus the ones they want to keep or add.
 */
export async function setFilePlaylists(
  mediaId: string | number,
  playlistIds: number[]
): Promise<void> {
  await azuracastApi.put(`/station/${STATION_ID}/file/${mediaId}`, { playlists: playlistIds });
}

export async function getPlaylistDetail(playlistId: number): Promise<PlaylistDetail> {
  const { data } = await azuracastApi.get<PlaylistDetail>(
    `/station/${STATION_ID}/playlist/${playlistId}`
  );
  return data;
}

export async function updatePlaylist(
  playlistId: number,
  data: Record<string, unknown>
): Promise<void> {
  await azuracastApi.put(`/station/${STATION_ID}/playlist/${playlistId}`, data);
}

export async function clonePlaylist(playlistId: number): Promise<{ id: number; name: string }> {
  const { data } = await azuracastApi.post<{ id: number; name: string }>(
    `/station/${STATION_ID}/playlist/${playlistId}/clone`
  );
  return data;
}

/** Every playlist of the station, including its schedule items. */
export async function listStationPlaylists(): Promise<PlaylistDetail[]> {
  const { data } = await azuracastApi.get<PlaylistDetail[]>(`/station/${STATION_ID}/playlists`);
  return Array.isArray(data) ? data : [];
}

export interface CreatePlaylistParams {
  name: string;
  /** 'songs' keeps the playlist bound to the media library. */
  source?: string;
  order?: "sequential" | "random" | "shuffle";
  description?: string;
}

/**
 * Creates a sequential playlist bound to the media library.
 *
 * Only fields that exist in the current StationPlaylist entity are sent:
 * `shuffle_enabled` and `play_full_cycle` were removed upstream and would be
 * meaningless. A sequential library playlist already drops an item once it has
 * played, which is what makes the archive detection work.
 */
export async function createPlaylist(params: CreatePlaylistParams): Promise<{ id: number; name: string }> {
  const { data } = await azuracastApi.post<{ id: number; name: string }>(
    `/station/${STATION_ID}/playlists`,
    {
      name: params.name,
      type: "default",
      source: params.source ?? "songs",
      order: params.order ?? "sequential",
      is_enabled: true,
      include_in_requests: false,
      include_in_on_demand: false,
      // A program may hold the same recording twice on purpose.
      avoid_duplicates: false,
      ...(params.description ? { description: params.description } : {}),
    }
  );
  return data;
}

/** Creates a directory in the media library, ignoring an existing one. */
export async function ensureMediaDirectory(directoryPath: string): Promise<void> {
  await azuracastApi.put(
    `/station/${STATION_ID}/files/mkdir`,
    {},
    { params: { currentDirectory: parentDirectory(directoryPath), name: lastSegment(directoryPath) } }
  );
}

export function parentDirectory(directoryPath: string): string {
  const normalized = directoryPath.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

export function lastSegment(directoryPath: string): string {
  const normalized = directoryPath.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

/** Moves a media file to another path, keeping the same metadata. */
export async function moveMediaFile(fromPath: string, toPath: string): Promise<void> {
  if (fromPath === toPath) return;
  await azuracastApi.put(`/station/${STATION_ID}/files/rename`, {
    file: fromPath,
    newPath: toPath,
  });
}

/** Song fields AzuraCast accepts through the media edit endpoint. */
export interface MediaMetadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  isrc?: string;
  lyrics?: string;
}

/** Writes the song fields of a media file and, optionally, its playlist list. */
export async function updateMediaMetadata(
  mediaId: string | number,
  metadata: MediaMetadata,
  playlistIds?: number[]
): Promise<void> {
  const payload: Record<string, unknown> = { ...metadata };
  if (playlistIds) {
    payload.playlists = playlistIds.map((id) => ({ id, weight: 0 }));
  }
  await azuracastApi.put(`/station/${STATION_ID}/file/${mediaId}`, payload);
}

/** Uploads the album art of a media file. */
export async function uploadMediaArt(mediaId: string | number, art: Buffer): Promise<void> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(art)], { type: "image/webp" }), "art.webp");
  await azuracastApi.post(`/station/${STATION_ID}/art/${mediaId}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: AZURACAST_UPLOAD_TIMEOUT_MS,
    maxBodyLength: Infinity,
  });
}
