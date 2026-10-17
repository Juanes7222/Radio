import {
  getFileDetail,
  getPlaylistDetail,
  getPlaylistOrder,
  setFilePlaylists,
  setPlaylistOrder,
  updatePlaylist,
  type PlaylistOrderEntry,
} from "../rotation/azuracastPlaylist.service";

/**
 * AzuraCast backend options used here. `merge` makes the AutoDJ fuse every song of
 * the playlist into a single track, which is what glues the intro and the outro to
 * the block without composing anything server side. `single_track` selects the
 * playlist only once inside its time window, so the block airs exactly once.
 */
const OPTION_SINGLE_TRACK = "single_track";
const OPTION_MERGE = "merge";

export type BumperPosition = "first" | "last";

export interface BumperPlaylistState {
  name: string;
  source: string;
  order: string;
  backendOptions: string[];
  hasSchedule: boolean;
  isEnabled: boolean;
}

/** Reads the playlist state the bumpers depend on. */
export async function readPlaylistForBumper(playlistId: number): Promise<BumperPlaylistState> {
  const detail = await getPlaylistDetail(playlistId);
  return {
    name: detail.name,
    source: detail.source,
    order: detail.order,
    backendOptions: detail.backend_options ?? [],
    hasSchedule: (detail.schedule_items ?? []).length > 0,
    isEnabled: detail.is_enabled !== false,
  };
}

/**
 * Maps the playlist rows to the weights that leave the intro first and the outro
 * last, keeping the relative order of everything in between. The returned keys
 * are playlist-media row ids, which is what the AzuraCast reorder endpoint takes.
 *
 * When the same media is used for both ends it is placed once, at the end.
 */
export function computeReorder(
  entries: PlaylistOrderEntry[],
  introUniqueId: string | null,
  outroUniqueId: string | null
): Record<number, number> {
  const ordered = [...entries].sort((a, b) => a.weight - b.weight);
  const sameMedia = introUniqueId !== null && introUniqueId === outroUniqueId;
  const findRow = (uniqueId: string | null) =>
    uniqueId ? ordered.find((entry) => entry.media.unique_id === uniqueId) : undefined;

  const introRow = sameMedia ? undefined : findRow(introUniqueId);
  const outroRow = findRow(outroUniqueId);
  const middle = ordered.filter((entry) => entry !== introRow && entry !== outroRow);

  const next = [
    ...(introRow ? [introRow] : []),
    ...middle,
    ...(outroRow ? [outroRow] : []),
  ];

  const order: Record<number, number> = {};
  next.forEach((entry, index) => {
    order[entry.id] = index + 1;
  });
  return order;
}

/**
 * Ensures a bumper media belongs to the playlist and sits at the requested end.
 * `otherUniqueId` is the unique_id of the bumper on the opposite end, so pinning
 * one side does not push the other one away from its place.
 */
export async function pinBumperMedia(
  playlistId: number,
  mediaUniqueId: string,
  position: BumperPosition,
  otherUniqueId: string | null
): Promise<void> {
  const detail = await getFileDetail(mediaUniqueId);
  const currentIds = detail.playlists.map((playlist) => playlist.id);
  if (!currentIds.includes(playlistId)) {
    await setFilePlaylists(mediaUniqueId, [...currentIds, playlistId]);
  }

  const entries = await getPlaylistOrder(playlistId);
  await setPlaylistOrder(
    playlistId,
    computeReorder(
      entries,
      position === "first" ? mediaUniqueId : otherUniqueId,
      position === "last" ? mediaUniqueId : otherUniqueId
    )
  );
}

/**
 * Decides the backend options of a bumper playlist, keeping the ones the admin
 * set by hand (`interrupt` and whatever AzuraCast adds later).
 *
 * `single_track` only makes sense together with `merge`: merged, the block IS one
 * track, and the window must not replay it. Without `merge` the playlist keeps the
 * window semantics the station owner gave it — forcing `single_track` there would
 * cut a news window down to a single file, which is the opposite of what a separate
 * intro and outro are supposed to do.
 */
export function computeBumperOptions(current: string[], glued: boolean): string[] {
  const options = current.filter(
    (option) => option !== OPTION_SINGLE_TRACK && option !== OPTION_MERGE
  );
  if (glued) options.push(OPTION_SINGLE_TRACK, OPTION_MERGE);
  return options;
}

/**
 * Writes the backend options of a bumper playlist. Only `merge` and
 * `single_track` are touched, because they are the ones that decide whether the
 * block is glued and how many times it airs.
 */
export async function applyBumperOptions(playlistId: number, glued: boolean): Promise<void> {
  const current = await readPlaylistForBumper(playlistId);
  await updatePlaylist(playlistId, {
    order: "sequential",
    backend_options: computeBumperOptions(current.backendOptions, glued),
  });
}

/**
 * Puts back the options and the order the playlist had before a bumper touched
 * it. An empty string means the playlist had no backend options at all.
 */
export async function restorePlaylistOptions(
  playlistId: number,
  previousBackendOptions: string,
  previousOrder: string
): Promise<void> {
  const backendOptions = previousBackendOptions
    .split(",")
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  await updatePlaylist(playlistId, {
    order: previousOrder,
    backend_options: backendOptions,
  });
}

/** Removes a bumper media from the playlist, leaving its other memberships alone. */
export async function unbindBumperMedia(playlistId: number, mediaUniqueId: string): Promise<void> {
  const detail = await getFileDetail(mediaUniqueId);
  const remaining = detail.playlists
    .filter((playlist) => playlist.id !== playlistId)
    .map((playlist) => playlist.id);
  await setFilePlaylists(mediaUniqueId, remaining);
}