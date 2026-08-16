import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";

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
  source: string;
  order: string;
  schedule_items?: PlaylistScheduleItem[];
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
  length: number;
}

export interface StationDirectory {
  name: string;
  path: string;
}

const FILES_PER_PAGE = 500;
const MAX_FILE_PAGES = 30;

/**
 * Fetches every media file of the station (paginated). Used to build the
 * ordered source when the rotation reads from a library folder.
 */
export async function listAllStationFiles(): Promise<StationFileRow[]> {
  const all: StationFileRow[] = [];

  for (let page = 1; page <= MAX_FILE_PAGES; page++) {
    const { data } = await azuracastApi.get<{ rows?: StationFileRow[] }>(
      `/station/${STATION_ID}/files`,
      { params: { per_page: FILES_PER_PAGE, page } }
    );
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    all.push(...rows);
    if (rows.length < FILES_PER_PAGE) break;
  }

  return all;
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
