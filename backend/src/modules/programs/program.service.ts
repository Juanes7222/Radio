import { prisma } from "../../infrastructure/database/prisma";
import { config } from "../../config";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { sanitizeFilename } from "../../shared/utils/sanitize";
import { slugify } from "../../shared/utils/text";
import {
  deleteMediaFileIfExists,
  ensureDir,
  getMediaFilePath,
  resolveStorageDir,
  writeMediaFile,
} from "../../shared/storage/localStorage";
import {
  deleteArtwork,
  getArtworkUrl,
  replaceProgramArtwork,
} from "./program.artwork.service";
import { clockToMinutes, minutesToClock } from "./program.slotFinder.service";
import {
  ALL_DAYS_MASK,
  DEFAULT_PENDING_FOLDER,
  DEFAULT_PLAYED_FOLDER,
  type EpisodeStatus,
  type ScheduleMode,
} from "./program.constants";
import {
  createPlaylist,
  ensureMediaDirectory,
  getFileDetail,
  getPlaylistDetail,
  playlistBlockingReason,
  setFilePlaylists,
} from "../rotation/azuracastPlaylist.service";
import type { Program, ProgramEpisode, ProgramEpisodeCounts, ProgramScheduleMode } from "@radio/types";

export type ProgramRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  artFile: string | null;
  introFile: string | null;
  outroFile: string | null;
  fadeSeconds: number;
  playlistId: number;
  pendingFolder: string;
  playedFolder: string;
  folderName: string;
  scheduleMode: string;
  daysMask: number;
  airStartMinute: number | null;
  airEndMinute: number | null;
  daysAhead: number;
  leadMinutes: number;
  bufferMinutes: number;
  active: boolean;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EpisodeRow = {
  id: string;
  programId: string;
  title: string;
  sourceFile: string;
  status: string;
  uploadDate: string;
  durationSec: number | null;
  relativePath: string | null;
  mediaId: string | null;
  artFile: string | null;
  normalizeLoudness: boolean;
  reduceNoise: boolean;
  errorMessage: string | null;
  queuedAt: Date | null;
  playedAt: Date | null;
  createdAt: Date;
};

const EMPTY_COUNTS: ProgramEpisodeCounts = {
  total: 0,
  draft: 0,
  processing: 0,
  queued: 0,
  played: 0,
  failed: 0,
};

/** Folder of the program inside the AzuraCast media library. */
export function programFolderPath(folderName: string): string {
  return `${config.programs.rootFolder}/${folderName}`;
}

function programAssetDir(): string {
  const dir = resolveStorageDir(config.programs.assetDir);
  ensureDir(dir);
  return dir;
}

export function getProgramAssetPath(fileName: string): string {
  return getMediaFilePath(programAssetDir(), fileName);
}

// ── DTO mapping ──

export function toEpisodeDto(episode: EpisodeRow): ProgramEpisode {
  return {
    id: episode.id,
    programId: episode.programId,
    title: episode.title,
    sourceFile: episode.sourceFile,
    status: episode.status as ProgramEpisode["status"],
    uploadDate: episode.uploadDate,
    durationSec: episode.durationSec,
    relativePath: episode.relativePath,
    mediaId: episode.mediaId,
    artUrl: getArtworkUrl(episode.artFile),
    normalizeLoudness: episode.normalizeLoudness,
    reduceNoise: episode.reduceNoise,
    errorMessage: episode.errorMessage,
    queuedAt: episode.queuedAt?.toISOString() ?? null,
    playedAt: episode.playedAt?.toISOString() ?? null,
    createdAt: episode.createdAt.toISOString(),
  };
}

function toProgramDto(
  program: ProgramRow,
  playlistName: string | null,
  playlistWarning: string | null,
  counts: ProgramEpisodeCounts
): Program {
  return {
    id: program.id,
    name: program.name,
    slug: program.slug,
    description: program.description,
    artist: program.artist,
    album: program.album,
    genre: program.genre,
    artUrl: getArtworkUrl(program.artFile),
    hasIntro: Boolean(program.introFile),
    hasOutro: Boolean(program.outroFile),
    fadeSeconds: program.fadeSeconds,
    playlistId: program.playlistId,
    playlistName,
    playlistWarning,
    folderName: program.folderName,
    pendingFolder: program.pendingFolder,
    playedFolder: program.playedFolder,
    scheduleMode: program.scheduleMode as ProgramScheduleMode,
    daysMask: program.daysMask,
    airStart: program.airStartMinute === null ? null : minutesToClock(program.airStartMinute),
    airEnd: program.airEndMinute === null ? null : minutesToClock(program.airEndMinute),
    daysAhead: program.daysAhead,
    leadMinutes: program.leadMinutes,
    bufferMinutes: program.bufferMinutes,
    active: program.active,
    lastSyncAt: program.lastSyncAt?.toISOString() ?? null,
    counts,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
  };
}

async function countEpisodes(programId: string): Promise<ProgramEpisodeCounts> {
  const grouped = await prisma.programEpisode.groupBy({
    by: ["status"],
    where: { programId },
    _count: { _all: true },
  });

  const counts: ProgramEpisodeCounts = { ...EMPTY_COUNTS };
  for (const row of grouped) {
    counts.total += row._count._all;
    if (row.status === "draft") counts.draft = row._count._all;
    else if (row.status === "processing") counts.processing = row._count._all;
    else if (row.status === "queued") counts.queued = row._count._all;
    else if (row.status === "played") counts.played = row._count._all;
    else if (row.status === "failed") counts.failed = row._count._all;
  }
  return counts;
}

async function resolvePlaylist(playlistId: number): Promise<{
  name: string | null;
  warning: string | null;
}> {
  try {
    const detail = await getPlaylistDetail(playlistId);
    return { name: detail.name, warning: playlistBlockingReason(detail) };
  } catch {
    return { name: null, warning: `No se encontró la playlist #${playlistId} en AzuraCast.` };
  }
}

// ── Queries ──

export async function listPrograms(): Promise<Program[]> {
  const rows = await prisma.program.findMany({ orderBy: { createdAt: "desc" } });
  const playlists = await Promise.all(rows.map((row) => resolvePlaylist(row.playlistId)));
  const counts = await Promise.all(rows.map((row) => countEpisodes(row.id)));
  return rows.map((row, index) =>
    toProgramDto(row, playlists[index].name, playlists[index].warning, counts[index])
  );
}

export async function getProgram(id: string): Promise<Program> {
  const row = await findProgramRow(id);
  const playlist = await resolvePlaylist(row.playlistId);
  return toProgramDto(row, playlist.name, playlist.warning, await countEpisodes(row.id));
}

export async function findProgramRow(id: string): Promise<ProgramRow> {
  const row = await prisma.program.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "Programa no encontrado.");
  return row;
}

export async function listEpisodes(
  programId: string,
  options: { status?: EpisodeStatus; limit?: number } = {}
): Promise<ProgramEpisode[]> {
  const rows = await prisma.programEpisode.findMany({
    where: {
      programId,
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 200, 500),
  });
  return rows.map(toEpisodeDto);
}

// ── Program write ──

export interface ProgramInput {
  name: string;
  /**
   * AzuraCast playlist that drives the program. `null` asks the backend to
   * create one named after the program.
   */
  playlistId?: number | null;
  description?: string | null;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  scheduleMode?: ScheduleMode;
  daysMask?: number;
  airStart?: string | null;
  airEnd?: string | null;
  daysAhead?: number;
  leadMinutes?: number;
  bufferMinutes?: number;
  active?: boolean;
  fadeSeconds?: number;
}

/**
 * Checks that a playlist can hold the episodes of a program. The station must
 * own the playlist and it must be a plain library playlist, otherwise the
 * episode would never be queued.
 */
async function requireUsablePlaylist(playlistId: number): Promise<void> {
  let detail;
  try {
    detail = await getPlaylistDetail(playlistId);
  } catch {
    throw new AppError(404, `No se encontró la playlist #${playlistId} en AzuraCast.`);
  }

  const reason = playlistBlockingReason(detail);
  if (reason) throw new AppError(409, reason);
}

/** Creates the four library folders of the program, one level at a time. */
export async function ensureProgramFolders(folderName: string): Promise<void> {
  const programFolder = programFolderPath(folderName);
  const directories = [
    config.programs.rootFolder,
    programFolder,
    `${programFolder}/${DEFAULT_PENDING_FOLDER}`,
    `${programFolder}/${DEFAULT_PLAYED_FOLDER}`,
  ];

  for (const directory of directories) {
    try {
      await ensureMediaDirectory(directory);
    } catch (err) {
      logger.warn("Programs", "Could not create library directory", {
        directory,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function createProgram(input: ProgramInput): Promise<Program> {
  const name = input.name.trim();
  const slug = slugify(name);
  if (slug.length === 0) {
    throw new AppError(400, "El nombre del programa debe tener al menos una letra.");
  }

  const clash = await prisma.program.findFirst({ where: { OR: [{ name }, { slug }] } });
  if (clash) {
    throw new AppError(409, "Ya existe un programa con ese nombre.");
  }

  const playlistId =
    input.playlistId === null
    ? (await createPlaylist({ name, order: "sequential" })).id
    : input.playlistId;

  if (playlistId === undefined) {
    throw new AppError(400, "Indica la playlist de AzuraCast que manejará el programa.");
  }
  await requireUsablePlaylist(playlistId);

  try {
    const row = await prisma.program.create({
      data: {
        name,
        slug,
        description: input.description?.trim() || null,
        artist: input.artist?.trim() || null,
        album: input.album?.trim() || null,
        genre: input.genre?.trim() || null,
        playlistId,
        pendingFolder: DEFAULT_PENDING_FOLDER,
        playedFolder: DEFAULT_PLAYED_FOLDER,
        folderName: slug,
        scheduleMode: input.scheduleMode ?? "none",
        daysMask: input.daysMask ?? ALL_DAYS_MASK,
        airStartMinute: input.airStart ? clockToMinutes(input.airStart) : null,
        airEndMinute: input.airEnd ? clockToMinutes(input.airEnd) : null,
        daysAhead: input.daysAhead ?? 7,
        leadMinutes: input.leadMinutes ?? 10,
        bufferMinutes: input.bufferMinutes ?? 2,
        active: input.active ?? true,
        fadeSeconds: input.fadeSeconds ?? 0,
      },
    });
    await ensureProgramFolders(row.folderName);
    return getProgram(row.id);
  } catch (err) {
    logger.error("Programs", "Program creation failed", {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function updateProgram(id: string, input: Partial<ProgramInput>): Promise<Program> {
  const current = await findProgramRow(id);
  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0) throw new AppError(400, "El nombre del programa no puede estar vacío.");
    const slug = slugify(name);
    const clash = await prisma.program.findFirst({
      where: { OR: [{ name }, { slug }], NOT: { id } },
    });
    if (clash) throw new AppError(409, "Ya existe un programa con ese nombre.");
    data.name = name;
    data.slug = slug;
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.artist !== undefined) data.artist = input.artist?.trim() || null;
  if (input.album !== undefined) data.album = input.album?.trim() || null;
  if (input.genre !== undefined) data.genre = input.genre?.trim() || null;
  if (input.playlistId !== undefined) {
    const nextPlaylistId =
      input.playlistId === null
        ? (
            await createPlaylist({
              name: typeof data.name === "string" ? data.name : current.name,
              order: "sequential",
            })
          ).id
        : input.playlistId;
    if (nextPlaylistId !== current.playlistId) {
      await requireUsablePlaylist(nextPlaylistId);
      data.playlistId = nextPlaylistId;
    }
  }
  if (input.scheduleMode !== undefined) data.scheduleMode = input.scheduleMode;
  if (input.daysMask !== undefined) data.daysMask = input.daysMask;
  if (input.airStart !== undefined) {
    data.airStartMinute = input.airStart ? clockToMinutes(input.airStart) : null;
  }
  if (input.airEnd !== undefined) {
    data.airEndMinute = input.airEnd ? clockToMinutes(input.airEnd) : null;
  }
  if (input.daysAhead !== undefined) data.daysAhead = input.daysAhead;
  if (input.leadMinutes !== undefined) data.leadMinutes = input.leadMinutes;
  if (input.bufferMinutes !== undefined) data.bufferMinutes = input.bufferMinutes;
  if (input.active !== undefined) data.active = input.active;
  if (input.fadeSeconds !== undefined) data.fadeSeconds = input.fadeSeconds;

  await prisma.program.update({ where: { id }, data });
  if (data.slug !== undefined) await ensureProgramFolders(current.folderName);
  if (data.playlistId !== undefined) {
    await moveQueuedEpisodes(current.playlistId, data.playlistId as number);
  }
  return getProgram(id);
}

/**
 * Swaps the playlist of every episode still waiting in the queue, so a program
 * never leaves episodes behind in the playlist it used to use.
 */
async function moveQueuedEpisodes(fromPlaylistId: number, toPlaylistId: number): Promise<void> {
  const queued = await prisma.programEpisode.findMany({
    where: { status: "queued", mediaId: { not: null } },
    select: { id: true, mediaId: true },
  });

  const affected = queued.filter((episode) => episode.mediaId !== null);
  if (affected.length === 0) return;

  for (const episode of affected) {
    try {
      const detail = await getFileDetail(episode.mediaId as string);
      const remaining = detail.playlists
        .map((playlist) => playlist.id)
        .filter((playlistId) => playlistId !== fromPlaylistId);
      await setFilePlaylists(episode.mediaId as string, [...remaining, toPlaylistId]);
    } catch (err) {
      logger.warn("Programs", "Could not move an episode to the new playlist", {
        episodeId: episode.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Programs", "Queued episodes moved to the new playlist", {
    fromPlaylistId,
    toPlaylistId,
    count: affected.length,
  });
}

export async function setProgramArtwork(
  id: string,
  file: { buffer: Buffer; mimetype: string }
): Promise<Program> {
  const program = await findProgramRow(id);
  const stored = await replaceProgramArtwork(program.artFile, file.buffer, file.mimetype);
  await prisma.program.update({ where: { id }, data: { artFile: stored.fileName } });
  return getProgram(id);
}

export async function clearProgramArtwork(id: string): Promise<Program> {
  const program = await findProgramRow(id);
  if (program.artFile) deleteArtwork(program.artFile);
  await prisma.program.update({ where: { id }, data: { artFile: null } });
  return getProgram(id);
}

export async function setProgramAsset(
  id: string,
  kind: "intro" | "outro",
  file: { buffer: Buffer; originalname: string }
): Promise<Program> {
  const program = await findProgramRow(id);
  const rawExtension = file.originalname.includes(".")
    ? (file.originalname.split(".").pop() ?? "mp3")
    : "mp3";
  const extension = sanitizeFilename(rawExtension).toLowerCase().replace(/^\.+/, "") || "mp3";
  const fileName = `${id}-${kind}.${extension}`;

  writeMediaFile(getProgramAssetPath(fileName), file.buffer);

  const field = kind === "intro" ? "introFile" : "outroFile";
  const previous = program[field];
  await prisma.program.update({ where: { id }, data: { [field]: fileName } });
  if (previous && previous !== fileName) deleteMediaFileIfExists(getProgramAssetPath(previous));

  return getProgram(id);
}

export async function clearProgramAsset(id: string, kind: "intro" | "outro"): Promise<Program> {
  const program = await findProgramRow(id);
  const field = kind === "intro" ? "introFile" : "outroFile";
  const previous = program[field];
  if (previous) {
    deleteMediaFileIfExists(getProgramAssetPath(previous));
    await prisma.program.update({ where: { id }, data: { [field]: null } });
  }
  return getProgram(id);
}

export async function deleteProgram(id: string): Promise<void> {
  const program = await findProgramRow(id);
  if (program.artFile) deleteArtwork(program.artFile);
  for (const assetFile of [program.introFile, program.outroFile]) {
    if (assetFile) deleteMediaFileIfExists(getProgramAssetPath(assetFile));
  }
  await prisma.program.delete({ where: { id } });
}