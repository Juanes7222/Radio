import fs from "fs";
import path from "path";
import type { PlaylistBumper } from "@radio/types";
import { config } from "../../config";
import { prisma } from "../../infrastructure/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import {
  deleteMediaFileIfExists,
  getMediaFilePath,
  prepareStorageDir,
  writeMediaFile,
} from "../../shared/storage/localStorage";
import { slugify } from "../../shared/utils/text";
import { uploadFileToStation } from "../azuracast/upload.service";
import { ensureMediaDirectory, getFileDetail, updateMediaMetadata } from "../rotation/azuracastPlaylist.service";
import {
  applyBumperOptions,
  pinBumperMedia,
  readPlaylistForBumper,
  restorePlaylistOptions,
  unbindBumperMedia,
  type BumperPlaylistState,
} from "./bumper.azuracast.service";
import { BUMPER_ASSET_KINDS, BUMPER_LIBRARY_FOLDER, type BumperAssetKind } from "./bumper.constants";

export type PlaylistBumperRow = {
  id: string;
  label: string;
  playlistId: number;
  introMediaId: string | null;
  outroMediaId: string | null;
  introFile: string | null;
  outroFile: string | null;
  glued: boolean;
  priorBackendOptions: string | null;
  priorOrder: string | null;
  enabled: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface ReconcileResult {
  id: string;
  label: string;
  warnings: string[];
  pinnedIntro: boolean;
  pinnedOutro: boolean;
}

interface PlaylistSnapshot {
  name: string | null;
  warning: string | null;
}

const MISSING_MEDIA_WARNING_KINDS: Record<BumperAssetKind, string> = {
  intro: "El intro ya no está en AzuraCast y no hay copia local para volver a subirlo.",
  outro: "El outro ya no está en AzuraCast y no hay copia local para volver a subirlo.",
};

// ── Warnings ──

/**
 * Reads the playlist the way the station owner should read it: what it is called,
 * and why it may not behave the way the admin asked for.
 */
function snapshotFrom(state: BumperPlaylistState): PlaylistSnapshot {
  const warnings: string[] = [];

  if (state.source !== "songs") {
    warnings.push(
      `La playlist "${state.name}" no está basada en la biblioteca de audio, así que AzuraCast no puede fusionar el bloque y el intro y el outro quedan como pistas separadas.`
    );
  }
  if (!state.hasSchedule) {
    warnings.push(
      `La playlist "${state.name}" no tiene franja horaria, así que el bumper no se emitirá por su cuenta.`
    );
  }

  return { name: state.name, warning: warnings.length > 0 ? warnings.join(" ") : null };
}

async function snapshotOf(playlistId: number): Promise<PlaylistSnapshot> {
  try {
    return snapshotFrom(await readPlaylistForBumper(playlistId));
  } catch {
    return { name: null, warning: `No se encontró la playlist #${playlistId} en AzuraCast.` };
  }
}

// ── DTO mapping ──

function toBumperDto(row: PlaylistBumperRow, playlist: PlaylistSnapshot): PlaylistBumper {
  return {
    id: row.id,
    label: row.label,
    playlistId: row.playlistId,
    playlistName: playlist.name,
    warning: playlist.warning,
    hasIntro: Boolean(row.introMediaId),
    hasOutro: Boolean(row.outroMediaId),
    glued: row.glued,
    enabled: row.enabled,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findBumperRow(id: string): Promise<PlaylistBumperRow> {
  const row = await prisma.playlistBumper.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "Intro y outro no encontrado.");
  return row;
}

// ── Guards ──

/**
 * Rejects the playlists a bumper must never touch. The general content playlist
 * would be fused whole, which would glue a bumper to the entire music of the day,
 * and a playlist owned by a Program already gets its episodes glued with ffmpeg.
 */
async function assertPlaylistIsAvailable(playlistId: number): Promise<BumperPlaylistState> {
  const state = await readPlaylistForBumper(playlistId).catch(() => null);
  if (!state) {
    throw new AppError(404, `No se encontró la playlist #${playlistId} en AzuraCast.`);
  }

  const generalPlaylistId = Number.parseInt(config.azuracast.playlistId, 10);
  if (Number.isInteger(generalPlaylistId) && generalPlaylistId === playlistId) {
    throw new AppError(
      409,
      "Esa playlist es el contenido variado general de la estación: pegarle un intro y un outro fusionaría toda la música del día."
    );
  }

  const program = await prisma.program.findFirst({
    where: { playlistId },
    select: { name: true },
  });
  if (program) {
    throw new AppError(
      409,
      `La playlist #${playlistId} es la del programa "${program.name}" y sus episodios ya se pegan con el intro y el outro al publicarse.`
    );
  }

  const existing = await prisma.playlistBumper.findUnique({ where: { playlistId } });
  if (existing) {
    throw new AppError(
      409,
      `La playlist #${playlistId} ya tiene el intro y el outro de "${existing.label}".`
    );
  }

  return state;
}

// ── Library files ──

function bumperLibraryFolder(): string {
  return `${config.programs.rootFolder}/${BUMPER_LIBRARY_FOLDER}`;
}

function bumperTitle(label: string, kind: BumperAssetKind): string {
  return `${label} — ${kind === "intro" ? "intro" : "outro"}`;
}

/** Uploads a stored bumper copy to the station library and returns its unique_id. */
async function uploadBumperFile(
  row: PlaylistBumperRow,
  fileName: string,
  kind: BumperAssetKind
): Promise<string> {
  const assetPath = getMediaFilePath(prepareStorageDir(config.bumpers.assetDir), fileName);
  const buffer = fs.readFileSync(assetPath);
  const libraryPath = `${bumperLibraryFolder()}/${fileName}`;

  await ensureMediaDirectory(libraryPath);
  const uploaded = await uploadFileToStation(libraryPath, buffer.toString("base64"));
  await updateMediaMetadata(uploaded.unique_id, { title: bumperTitle(row.label, kind) });

  return uploaded.unique_id;
}

/** AzuraCast answers 404 for a media that was deleted from the library. */
async function mediaStillExists(mediaUniqueId: string): Promise<boolean> {
  try {
    return Boolean((await getFileDetail(mediaUniqueId))?.unique_id);
  } catch {
    return false;
  }
}

/** Puts the playlist back the way it was before a bumper touched it. */
async function releasePlaylist(row: PlaylistBumperRow): Promise<void> {
  if (row.priorBackendOptions !== null || row.priorOrder !== null) {
    await restorePlaylistOptions(
      row.playlistId,
      row.priorBackendOptions ?? "",
      row.priorOrder ?? "sequential"
    );
  }
  for (const mediaId of [row.introMediaId, row.outroMediaId]) {
    if (!mediaId) continue;
    try {
      await unbindBumperMedia(row.playlistId, mediaId);
    } catch (err) {
      logger.warn("Bumpers", "Could not detach a bumper media", {
        bumperId: row.id,
        mediaId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── Queries ──

export async function listBumpers(): Promise<PlaylistBumper[]> {
  const rows = await prisma.playlistBumper.findMany({ orderBy: { createdAt: "desc" } });
  const snapshots = await Promise.all(rows.map((row) => snapshotOf(row.playlistId)));
  return rows.map((row, index) => toBumperDto(row, snapshots[index]));
}

// ── Mutations ──

export async function createBumper(input: {
  label: string;
  playlistId: number;
  glued?: boolean;
}): Promise<PlaylistBumper> {
  const label = input.label.trim();
  if (!label) throw new AppError(400, "El nombre del programa es obligatorio.");
  if (!Number.isInteger(input.playlistId)) {
    throw new AppError(400, "La playlist debe ser un número.");
  }

  const state = await assertPlaylistIsAvailable(input.playlistId);
  const row = await prisma.playlistBumper.create({
    data: { label, playlistId: input.playlistId, glued: input.glued ?? true },
  });

  return toBumperDto(row, snapshotFrom(state));
}

export async function updateBumper(
  id: string,
  input: { label?: string; enabled?: boolean; glued?: boolean; playlistId?: number }
): Promise<PlaylistBumper> {
  const current = await findBumperRow(id);
  const data: Partial<PlaylistBumperRow> = {};

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new AppError(400, "El nombre del programa es obligatorio.");
    data.label = label;
  }

  if (input.playlistId !== undefined && input.playlistId !== current.playlistId) {
    if (!Number.isInteger(input.playlistId)) {
      throw new AppError(400, "La playlist debe ser un número.");
    }
    await assertPlaylistIsAvailable(input.playlistId);
    await releasePlaylist(current);
    data.playlistId = input.playlistId;
    // The snapshot belongs to the old playlist, so the next reconcile takes a new one.
    data.priorBackendOptions = null;
    data.priorOrder = null;
  }

  if (input.enabled === false && current.enabled) {
    await releasePlaylist(current);
    data.enabled = false;
  }

  if (input.glued !== undefined) {
    data.glued = input.glued;
  }

  await prisma.playlistBumper.update({ where: { id }, data });
  const row = await findBumperRow(id);

  // Anything that changes how the playlist must look is applied right away; a
  // plain rename is not worth an AzuraCast round trip.
  const needsReconcile =
    input.playlistId !== undefined || input.glued !== undefined || input.enabled === true;
  if (needsReconcile && row.enabled) {
    await reconcileBumper(id);
  }

  return toBumperDto(await findBumperRow(id), await snapshotOf(row.playlistId));
}

export async function deleteBumper(id: string): Promise<void> {
  const row = await findBumperRow(id);
  await releasePlaylist(row);

  const assetDir = prepareStorageDir(config.bumpers.assetDir);
  for (const fileName of [row.introFile, row.outroFile]) {
    if (fileName) deleteMediaFileIfExists(getMediaFilePath(assetDir, fileName));
  }

  await prisma.playlistBumper.delete({ where: { id } });
}

export async function setBumperAsset(
  id: string,
  kind: BumperAssetKind,
  uploadedFilePath: string,
  originalName: string
): Promise<PlaylistBumper> {
  const row = await findBumperRow(id);
  const assetDir = prepareStorageDir(config.bumpers.assetDir);
  const extension = path.extname(originalName) || ".mp3";
  const fileName = `${slugify(row.label)}-${kind}${extension}`;

  const buffer = fs.readFileSync(uploadedFilePath);
  writeMediaFile(getMediaFilePath(assetDir, fileName), buffer);

  const libraryPath = `${bumperLibraryFolder()}/${fileName}`;
  await ensureMediaDirectory(libraryPath);
  const uploaded = await uploadFileToStation(libraryPath, buffer.toString("base64"));
  await updateMediaMetadata(uploaded.unique_id, { title: bumperTitle(row.label, kind) });

  // The bumper being replaced is detached so the playlist does not keep both.
  const replacedMediaId = kind === "intro" ? row.introMediaId : row.outroMediaId;
  if (replacedMediaId) {
    await unbindBumperMedia(row.playlistId, replacedMediaId).catch((err: unknown) => {
      logger.warn("Bumpers", "Could not detach the replaced bumper media", {
        bumperId: id,
        mediaId: replacedMediaId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
  const replacedFile = kind === "intro" ? row.introFile : row.outroFile;
  if (replacedFile && replacedFile !== fileName) {
    deleteMediaFileIfExists(getMediaFilePath(assetDir, replacedFile));
  }

  await prisma.playlistBumper.update({
    where: { id },
    data:
      kind === "intro"
        ? { introMediaId: uploaded.unique_id, introFile: fileName }
        : { outroMediaId: uploaded.unique_id, outroFile: fileName },
  });

  await reconcileBumper(id);
  return toBumperDto(await findBumperRow(id), await snapshotOf(row.playlistId));
}

export async function clearBumperAsset(id: string, kind: BumperAssetKind): Promise<PlaylistBumper> {
  const row = await findBumperRow(id);
  const mediaId = kind === "intro" ? row.introMediaId : row.outroMediaId;
  const fileName = kind === "intro" ? row.introFile : row.outroFile;

  if (mediaId) await unbindBumperMedia(row.playlistId, mediaId);
  if (fileName) {
    deleteMediaFileIfExists(getMediaFilePath(prepareStorageDir(config.bumpers.assetDir), fileName));
  }

  await prisma.playlistBumper.update({
    where: { id },
    data:
      kind === "intro"
        ? { introMediaId: null, introFile: null }
        : { outroMediaId: null, outroFile: null },
  });

  return toBumperDto(await findBumperRow(id), await snapshotOf(row.playlistId));
}

// ── Reconciliation ──

/**
 * Brings one playlist back to the shape its bumper asks for: the intro first, the
 * outro last, and the backend options that make the block air once. It is
 * idempotent and it runs on a timer, because the rotation empties and rebuilds its
 * playlist every night and AzuraCast may drop a played item from a sequential one.
 */
export async function reconcileBumper(id: string): Promise<ReconcileResult> {
  const row = await findBumperRow(id);
  const empty: ReconcileResult = {
    id: row.id,
    label: row.label,
    warnings: [],
    pinnedIntro: false,
    pinnedOutro: false,
  };

  if (!row.enabled) return empty;

  let state: BumperPlaylistState;
  try {
    state = await readPlaylistForBumper(row.playlistId);
  } catch {
    return { ...empty, warnings: [`No se encontró la playlist #${row.playlistId} en AzuraCast.`] };
  }

  // `merge` is only emitted for library-backed playlists, so there is nothing to
  // pin against and touching the order would only confuse the panel.
  if (state.source !== "songs") {
    return {
      ...empty,
      warnings: [
        `La playlist "${state.name}" no está basada en la biblioteca de audio, así que AzuraCast no puede fusionar el bloque.`,
      ],
    };
  }

  const warnings: string[] = [];
  let introMediaId = row.introMediaId;
  let outroMediaId = row.outroMediaId;

  for (const kind of BUMPER_ASSET_KINDS) {
    const mediaId = kind === "intro" ? introMediaId : outroMediaId;
    if (!mediaId || (await mediaStillExists(mediaId))) continue;

    const fileName = kind === "intro" ? row.introFile : row.outroFile;
    if (!fileName) {
      warnings.push(MISSING_MEDIA_WARNING_KINDS[kind]);
      continue;
    }

    const uniqueId = await uploadBumperFile(row, fileName, kind);
    if (kind === "intro") introMediaId = uniqueId;
    else outroMediaId = uniqueId;
  }

  // The snapshot has to be taken before the options are overwritten, or there is
  // nothing left to restore when the bumper is disabled or deleted.
  if (row.priorBackendOptions === null || row.priorOrder === null) {
    await prisma.playlistBumper.update({
      where: { id },
      data: {
        priorBackendOptions: state.backendOptions.join(","),
        priorOrder: state.order,
        ...(introMediaId !== row.introMediaId ? { introMediaId } : {}),
        ...(outroMediaId !== row.outroMediaId ? { outroMediaId } : {}),
      },
    });
  } else if (introMediaId !== row.introMediaId || outroMediaId !== row.outroMediaId) {
    await prisma.playlistBumper.update({
      where: { id },
      data: {
        ...(introMediaId !== row.introMediaId ? { introMediaId } : {}),
        ...(outroMediaId !== row.outroMediaId ? { outroMediaId } : {}),
      },
    });
  }

  if (introMediaId) {
    await pinBumperMedia(row.playlistId, introMediaId, "first", outroMediaId);
  }
  if (outroMediaId) {
    await pinBumperMedia(row.playlistId, outroMediaId, "last", introMediaId);
  }
  await applyBumperOptions(row.playlistId, row.glued);

  await prisma.playlistBumper.update({ where: { id }, data: { lastSyncedAt: new Date() } });

  return {
    id: row.id,
    label: row.label,
    warnings,
    pinnedIntro: Boolean(introMediaId),
    pinnedOutro: Boolean(outroMediaId),
  };
}

export async function reconcileAllBumpers(): Promise<ReconcileResult[]> {
  const rows = await prisma.playlistBumper.findMany({ where: { enabled: true } });
  const results: ReconcileResult[] = [];

  for (const row of rows) {
    try {
      const result = await reconcileBumper(row.id);
      results.push(result);
      if (result.warnings.length > 0) {
        logger.warn("Bumpers", "Bumper reconciled with warnings", {
          bumperId: result.id,
          label: result.label,
          warnings: result.warnings,
        });
      }
    } catch (err) {
      // One broken playlist must not stop the rest of the station from being fixed.
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Bumpers", "Bumper reconciliation failed", {
        bumperId: row.id,
        label: row.label,
        error: message,
      });
      results.push({
        id: row.id,
        label: row.label,
        warnings: [message],
        pinnedIntro: false,
        pinnedOutro: false,
      });
    }
  }

  return results;
}