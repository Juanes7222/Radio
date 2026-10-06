import fs from "fs/promises";
import path from "path";
import { prisma } from "../../infrastructure/database/prisma";
import { config } from "../../config";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { getStationTime } from "../../shared/utils/date";
import { sanitizeFilename } from "../../shared/utils/sanitize";
import { titleFromFilename } from "../../shared/utils/text";
import { uploadFileToStation, deleteStationFile } from "../azuracast/upload.service";
import {
  getPlaylistDetail,
  getPlaylistOrder,
  getFileDetail,
  moveMediaFile,
  setFilePlaylists,
  updateMediaMetadata,
  uploadMediaArt,
  type MediaMetadata,
} from "../rotation/azuracastPlaylist.service";
import { composeEpisode } from "./program.audio.service";
import {
  cleanupEpisodeTempDirById,
  composedEpisodePath,
  createEpisodeTempDir,
  requireComposedEpisode,
} from "./program.temp";
import {
  deleteArtwork,
  readArtworkBuffer,
  storeArtwork,
} from "./program.artwork.service";
import {
  clockToMinutes,
  findFreeSlot,
  isWindowAvailable,
  replacePlaylistSchedule,
  toScheduleItem,
  withoutWindow,
} from "./program.slotFinder.service";
import {
  DEFAULT_FALLBACK_TITLE,
  type EpisodeStatus,
} from "./program.constants";
import {
  findProgramRow,
  getProgramAssetPath,
  programFolderPath,
  toEpisodeDto,
  type EpisodeRow,
  type ProgramRow,
} from "./program.service";
import type { ProgramEpisode, ProgramSyncResult } from "@radio/types";

export interface EpisodeInput {
  title?: string | null;
  /** Desired day for the manual schedule mode (AzuraCast index, 1 = Monday). */
  dayIndex?: number | null;
  startTime?: string | null;
  /** EBU R128 loudness pass over the composed episode. */
  normalizeLoudness?: boolean;
  /** Noise reduction before the loudness pass. */
  reduceNoise?: boolean;
}

export interface UploadedAudio {
  tempPath: string;
  originalName: string;
}

/** Library file name of an episode, prefixed with its station date. */
function buildLibraryFileName(episode: { uploadDate: string; title: string }): string {
  return `${episode.uploadDate} - ${sanitizeFilename(episode.title)}.mp3`;
}

function libraryFilePath(program: ProgramRow, relativePath: string): string {
  return `${programFolderPath(program.folderName)}/${relativePath}`;
}

/**
 * Composes the episode and leaves it in the scratch directory, without touching
 * AzuraCast. The admin listens to the result and only then publishes it, so a
 * wrong title or a bad audio adjustment never reaches the station library.
 *
 * Composing is the expensive part (ffmpeg re-encodes the whole file), and it is
 * what the preview plays, so publishing only uploads the file that was already
 * composed. It is not run in the background: the admin is waiting for the
 * player.
 */
export async function prepareEpisode(
  programId: string,
  input: EpisodeInput,
  audio: UploadedAudio,
  artwork: { buffer: Buffer; mimetype: string } | null
): Promise<{ episode: ProgramEpisode; warnings: string[] }> {
  const program = await findProgramRow(programId);
  if (!program.active) {
    throw new AppError(409, "El programa está inactivo. Actívalo antes de subir episodios.");
  }

  const title = input.title?.trim() || titleFromFilename(audio.originalName, DEFAULT_FALLBACK_TITLE);
  const warnings: string[] = [];

  if (!audio.tempPath.toLowerCase().endsWith(".mp3")) {
    warnings.push("El archivo no era MP3; se recomprimió a MP3 al componer.");
  }

  const artFile = artwork
    ? (await storeArtwork(artwork.buffer, artwork.mimetype)).fileName
    : program.artFile;

  const episodeRow = await prisma.programEpisode.create({
    data: {
      programId,
      title,
      sourceFile: sanitizeFilename(audio.originalName),
      status: "draft",
      uploadDate: getStationTime().dayKey,
      normalizeLoudness: input.normalizeLoudness ?? false,
      reduceNoise: input.reduceNoise ?? false,
      artFile,
    },
  });

  // The uploaded file moves into the scratch directory of the episode so the
  // request can clean up its own upload directory right away.
  const tempDir = await createEpisodeTempDir(episodeRow.id);
  const sourcePath = path.join(tempDir, `source${path.extname(audio.tempPath) || ".mp3"}`);
  await fs.rename(audio.tempPath, sourcePath);

  try {
    const composed = await composeEpisode({
      parts: [
        program.introFile ? getProgramAssetPath(program.introFile) : "",
        sourcePath,
        program.outroFile ? getProgramAssetPath(program.outroFile) : "",
      ].filter((part) => part.length > 0),
      outputPath: composedEpisodePath(episodeRow.id),
      fadeSeconds: program.fadeSeconds,
      normalizeLoudness: episodeRow.normalizeLoudness,
      reduceNoise: episodeRow.reduceNoise,
    });

    const minutes = Math.ceil(composed.durationSec / 60);
    if (minutes > config.programs.maxEpisodeMinutes) {
      throw new Error(
        `El episodio dura ${minutes} minutos y supera el máximo de ${config.programs.maxEpisodeMinutes}.`
      );
    }

    const stored = await prisma.programEpisode.update({
      where: { id: episodeRow.id },
      data: { durationSec: composed.durationSec },
    });

    logger.info("Programs", "Episode composed and ready to preview", {
      episodeId: episodeRow.id,
      program: program.name,
      durationSec: Math.round(composed.durationSec),
      integratedLoudnessDb: composed.integratedLoudnessDb,
      reduceNoise: episodeRow.reduceNoise,
      normalizeLoudness: episodeRow.normalizeLoudness,
    });

    return { episode: toEpisodeDto(stored), warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Programs", "Episode composition failed", {
      episodeId: episodeRow.id,
      error: message,
    });
    await prisma.programEpisode.update({
      where: { id: episodeRow.id },
      data: { status: "failed", errorMessage: message },
    });
    // Nothing is left worth keeping on disk.
    await cleanupEpisodeTempDirById(episodeRow.id);
    throw new AppError(422, message);
  } finally {
    // The source is no longer needed once the episode is composed.
    await fs.rm(sourcePath, { force: true });
  }
}

/**
 * Uploads an already composed episode to AzuraCast, writes its metadata and
 * artwork, and reserves the emission window.
 */
export async function publishEpisode(
  episodeId: string,
  input: EpisodeInput
): Promise<ProgramEpisode> {
  const episode = await findEpisodeRow(episodeId);
  if (episode.status !== "draft") {
    throw new AppError(409, "Solo se puede publicar un episodio preparado.");
  }

  const program = await findProgramRow(episode.programId);
  const audioPath = await requireComposedEpisode(episodeId);

  await prisma.programEpisode.update({ where: { id: episodeId }, data: { status: "processing" } });

  try {
    const fileName = buildLibraryFileName(episode);
    const relativePath = `${program.pendingFolder}/${fileName}`;
    const episodeAudio = await fs.readFile(audioPath);
    const uploaded = await uploadFileToStation(
      libraryFilePath(program, relativePath),
      episodeAudio.toString("base64")
    );

    const metadata: MediaMetadata = {
      title: episode.title,
      artist: program.artist ?? program.name,
      album: program.album ?? program.name,
      ...(program.genre ? { genre: program.genre } : {}),
    };
    await updateMediaMetadata(uploaded.unique_id, metadata, [program.playlistId]);

    const art = await readArtworkBuffer(episode.artFile, program.artFile);
    if (art) {
      try {
        await uploadMediaArt(uploaded.unique_id, art);
      } catch (err) {
        logger.warn("Programs", "Could not attach the artwork", {
          episodeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const durationSec = episode.durationSec ?? 0;
    const scheduleWarning = await applySchedule(program, episode, input, durationSec);

    await prisma.programEpisode.update({
      where: { id: episodeId },
      data: {
        status: "queued",
        mediaId: uploaded.unique_id,
        relativePath,
        queuedAt: new Date(),
        errorMessage: scheduleWarning,
      },
    });

    logger.info("Programs", "Episode published", {
      episodeId,
      program: program.name,
      durationSec: Math.round(durationSec),
      warning: scheduleWarning ?? null,
    });

    await cleanupEpisodeTempDirById(episodeId);
    return toEpisodeDto(await findEpisodeRow(episodeId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Programs", "Episode publish failed", { episodeId, error: message });
    await prisma.programEpisode.update({
      where: { id: episodeId },
      data: { status: "draft", errorMessage: message },
    });
    throw err;
  }
}

/**
 * Writes the emission window of a freshly published episode, when the program
 * is configured to schedule itself.
 *
 * When the linked playlist already carries schedule items, that existing
 * schedule IS the program airing pattern and AzuraCast drives it: the episode
 * simply queues into it and nothing is written, otherwise the automatic mode
 * would stack windows on top of the ones the station owner defined.
 *
 * Returns a human-readable note when the episode stays queued without a window
 * written by this call.
 */
async function applySchedule(
  program: ProgramRow,
  episode: EpisodeRow,
  input: EpisodeInput,
  durationSec: number
): Promise<string | null> {
  if (program.scheduleMode === "none") return null;

  const detail = await getPlaylistDetail(program.playlistId);
  const existingItems = detail.schedule_items ?? [];

  if (existingItems.length > 0) {
    return `La playlist ya tiene ${existingItems.length} franja(s) de emisión en AzuraCast; el episodio entra en esa programación.`;
  }

  const requiredMinutes = Math.max(1, Math.ceil(durationSec / 60));
  let dayIndex: number;
  let startMinute: number;
  let endMinute: number;

  if (program.scheduleMode === "auto") {
    const found = await findFreeSlot({
      playlistId: program.playlistId,
      daysMask: program.daysMask,
      airStartMinute: program.airStartMinute,
      airEndMinute: program.airEndMinute,
      daysAhead: program.daysAhead,
      leadMinutes: program.leadMinutes,
      bufferMinutes: program.bufferMinutes,
      durationSec,
    });
    if (!found.ok) return found.reason;
    dayIndex = found.slot.dayIndex;
    startMinute = found.slot.startMinute;
    endMinute = found.slot.endMinute;
  } else {
    if (!input.dayIndex || !input.startTime) {
      return "Falta indicar el día y la hora de emisión.";
    }
    dayIndex = input.dayIndex;
    startMinute = clockToMinutes(input.startTime);
    endMinute = startMinute + requiredMinutes;
    if (endMinute > 24 * 60) return "La franja indicada se pasa de la medianoche.";
    const available = await isWindowAvailable(
      program.playlistId,
      dayIndex,
      startMinute,
      endMinute,
      program.bufferMinutes
    );
    if (!available) return "La franja indicada ya está ocupada por otro programa.";
  }

  const items = withoutWindow(existingItems, dayIndex, startMinute);
  await replacePlaylistSchedule(program.playlistId, [
    ...items,
    toScheduleItem(dayIndex, startMinute, endMinute),
  ]);

  return null;
}

// ── Played detection ──

/**
 * Archives the episodes that already aired.
 *
 * A sequential playlist drops an item once it is played, so the membership of
 * the playlist is the source of truth. Episodes younger than the grace period
 * are skipped because AzuraCast may not have reflected the last write yet.
 */
export async function syncProgram(programId: string): Promise<ProgramSyncResult> {
  const program = await findProgramRow(programId);
  const result: ProgramSyncResult = { programId, checked: 0, archived: 0, errors: [] };

  const graceBefore = new Date(Date.now() - config.programs.playGraceMinutes * 60_000);
  const pending = await prisma.programEpisode.findMany({
    where: { programId, status: "queued", queuedAt: { lte: graceBefore } },
    orderBy: { queuedAt: "asc" },
  });

  if (pending.length === 0) {
    await prisma.program.update({ where: { id: programId }, data: { lastSyncAt: new Date() } });
    return result;
  }

  let inPlaylist: Set<string>;
  try {
    const order = await getPlaylistOrder(program.playlistId);
    inPlaylist = new Set(order.map((row) => row.media.unique_id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Programs", "Could not read the program playlist", { programId, error: message });
    result.errors.push(message);
    return result;
  }

  result.checked = pending.length;

  for (const episode of pending) {
    if (episode.mediaId && inPlaylist.has(episode.mediaId)) continue;

    try {
      if (episode.mediaId) await detachMedia(program, episode.mediaId);
      if (episode.relativePath) {
        const currentPath = libraryFilePath(program, episode.relativePath);
        const fileName = episode.relativePath.split("/").pop() ?? episode.relativePath;
        const playedPath = libraryFilePath(program, `${program.playedFolder}/${fileName}`);
        await moveMediaFile(currentPath, playedPath);
      }

      await prisma.programEpisode.update({
        where: { id: episode.id },
        data: { status: "played", playedAt: new Date(), errorMessage: null },
      });
      result.archived += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${episode.title}: ${message}`);
      logger.error("Programs", "Could not archive a played episode", {
        episodeId: episode.id,
        error: message,
      });
    }
  }

  await prisma.program.update({ where: { id: programId }, data: { lastSyncAt: new Date() } });

  if (result.archived > 0) {
    logger.info("Programs", "Episodes archived", {
      program: program.name,
      archived: result.archived,
      errors: result.errors.length,
    });
  }

  return result;
}

/** Drops the program playlist from a media file, keeping any other playlist. */
async function detachMedia(program: ProgramRow, mediaId: string): Promise<void> {
  try {
    const detail = await getFileDetail(mediaId);
    const remaining = detail.playlists
      .map((playlist) => playlist.id)
      .filter((playlistId) => playlistId !== program.playlistId);
    await setFilePlaylists(mediaId, remaining);
  } catch (err) {
    logger.warn("Programs", "Could not detach a played episode from the playlist", {
      mediaId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function syncAllPrograms(): Promise<ProgramSyncResult[]> {
  const programs = await prisma.program.findMany({ where: { active: true }, select: { id: true } });
  const results: ProgramSyncResult[] = [];
  for (const program of programs) {
    try {
      results.push(await syncProgram(program.id));
    } catch (err) {
      logger.error("Programs", "Program sync threw", {
        programId: program.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

// ── Manual actions ──

export async function markEpisodePlayed(episodeId: string): Promise<ProgramEpisode> {
  const episode = await findEpisodeRow(episodeId);
  const program = await findProgramRow(episode.programId);

  if (episode.mediaId) await detachMedia(program, episode.mediaId);
  if (episode.relativePath) {
    const fileName = episode.relativePath.split("/").pop() ?? episode.relativePath;
    await moveMediaFile(
      libraryFilePath(program, episode.relativePath),
      libraryFilePath(program, `${program.playedFolder}/${fileName}`)
    );
  }

  await prisma.programEpisode.update({
    where: { id: episodeId },
    data: { status: "played", playedAt: new Date(), errorMessage: null },
  });
  return toEpisodeDto(await findEpisodeRow(episodeId));
}

export async function markEpisodeQueued(episodeId: string): Promise<ProgramEpisode> {
  const episode = await findEpisodeRow(episodeId);
  const program = await findProgramRow(episode.programId);

  if (!episode.mediaId) {
    throw new AppError(409, "El episodio todavía no está en la biblioteca.");
  }

  if (episode.relativePath) {
    const fileName = episode.relativePath.split("/").pop() ?? episode.relativePath;
    await moveMediaFile(
      libraryFilePath(program, `${program.playedFolder}/${fileName}`),
      libraryFilePath(program, `${program.pendingFolder}/${fileName}`)
    );
  }

  await updateMediaMetadata(episode.mediaId, {}, [program.playlistId]);

  await prisma.programEpisode.update({
    where: { id: episodeId },
    data: {
      status: "queued",
      playedAt: null,
      queuedAt: new Date(),
      errorMessage: null,
    },
  });
  logger.info("Programs", "Episode requeued", { episodeId, program: program.name });
  return toEpisodeDto(await findEpisodeRow(episodeId));
}

/**
 * Removes an episode. The library file is deleted too unless the caller asks
 * to keep it, which is useful when the same audio still has to be archived.
 * A draft that never reached AzuraCast only leaves its scratch file behind.
 */
export async function deleteEpisode(episodeId: string, keepLibraryFile: boolean): Promise<void> {
  const episode = await findEpisodeRow(episodeId);
  const program = await findProgramRow(episode.programId);

  if (!keepLibraryFile && episode.mediaId) {
    await deleteStationFile(episode.mediaId);
  } else if (episode.mediaId) {
    await setFilePlaylists(episode.mediaId, []);
  }

  if (episode.artFile && episode.artFile !== program.artFile) deleteArtwork(episode.artFile);

  await prisma.programEpisode.delete({ where: { id: episodeId } });
  await cleanupEpisodeTempDirById(episodeId);
}

/**
 * Drops the previews nobody published. The composed file of a draft occupies
 * disk, so it is swept after a grace period.
 */
export async function discardStaleDrafts(): Promise<number> {
  const cutoff = new Date(Date.now() - config.programs.draftTtlHours * 3_600_000);
  const stale = await prisma.programEpisode.findMany({
    where: { status: "draft", createdAt: { lte: cutoff } },
    select: { id: true },
  });

  for (const episode of stale) {
    await prisma.programEpisode.delete({ where: { id: episode.id } }).catch(() => undefined);
    await cleanupEpisodeTempDirById(episode.id);
  }

  if (stale.length > 0) {
    logger.info("Programs", "Stale episode previews discarded", { count: stale.length });
  }
  return stale.length;
}

async function findEpisodeRow(id: string): Promise<EpisodeRow> {
  const row = await prisma.programEpisode.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "Episodio no encontrado.");
  return row;
}

export async function getEpisode(episodeId: string): Promise<ProgramEpisode> {
  return toEpisodeDto(await findEpisodeRow(episodeId));
}