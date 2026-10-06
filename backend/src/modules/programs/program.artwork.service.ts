import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { config } from "../../config";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import {
  deleteMediaFileIfExists,
  ensureDir,
  getMediaFilePath,
  prepareStorageDir,
  resolveStorageDir,
} from "../../shared/storage/localStorage";
import { ALLOWED_IMAGE_MIME_SET, PROGRAM_ART_MAX_BYTES } from "./program.constants";

const ART_SIZE = 600;

function getArtDir(): string {
  return prepareStorageDir(config.programs.artDir);
}

/** Public URL of a stored artwork file. */
export function getArtworkUrl(artFile: string | null): string | null {
  if (!artFile) return null;
  return `${config.programs.artUrlPrefix}/${artFile}`;
}

export interface StoredArtwork {
  fileName: string;
  url: string;
  sizeBytes: number;
}

/**
 * Normalizes an uploaded image into a square WebP so every episode of a
 * program shows the same artwork and AzuraCast does not have to re-encode a
 * large source image on each upload.
 */
export async function storeArtwork(buffer: Buffer, mimeType: string): Promise<StoredArtwork> {
  if (!ALLOWED_IMAGE_MIME_SET.has(mimeType)) {
    throw new AppError(400, "Tipo de imagen no permitido. Usa JPG, PNG, WebP, GIF o AVIF.");
  }
  if (buffer.length > PROGRAM_ART_MAX_BYTES) {
    throw new AppError(413, "La imagen supera el tamaño máximo permitido.");
  }

  const fileName = `${randomUUID()}.webp`;
  const outPath = getMediaFilePath(getArtDir(), fileName);

  try {
    const info = await sharp(buffer)
      .rotate()
      .resize({ width: ART_SIZE, height: ART_SIZE, fit: "cover", position: "attention" })
      .webp({ quality: 82, effort: 4 })
      .toFile(outPath);
    const { size } = fs.statSync(outPath);

    return { fileName, url: getArtworkUrl(fileName) as string, sizeBytes: size };
  } catch (err) {
    deleteMediaFileIfExists(outPath);
    logger.error("ProgramArtwork", "Could not optimize image", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(400, "No se pudo procesar la imagen.");
  }
}

/** Replaces the artwork of a program, deleting the previous file. */
export async function replaceProgramArtwork(
  previousArtFile: string | null,
  buffer: Buffer,
  mimeType: string
): Promise<StoredArtwork> {
  const stored = await storeArtwork(buffer, mimeType);
  if (previousArtFile) {
    deleteArtwork(previousArtFile);
  }
  return stored;
}

export function deleteArtwork(artFile: string): void {
  deleteMediaFileIfExists(getMediaFilePath(getArtDir(), artFile));
}

/**
 * Resolves the artwork of an episode, preferring its own image and falling
 * back to the program default.
 */
export async function readArtworkBuffer(
  episodeArtFile: string | null,
  programArtFile: string | null
): Promise<Buffer | null> {
  const candidates = [episodeArtFile, programArtFile].filter((value): value is string => Boolean(value));
  for (const artFile of candidates) {
    const filePath = getMediaFilePath(resolveStorageDir(config.programs.artDir), artFile);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    logger.warn("ProgramArtwork", "Stored artwork is missing, trying the next candidate", { artFile });
  }
  return null;
}

/** Directory holding the intro and outro assets. */
export function getAssetDir(): string {
  ensureDir(resolveStorageDir(config.programs.assetDir));
  return resolveStorageDir(config.programs.assetDir);
}

export function getAssetPath(fileName: string): string {
  return path.join(getAssetDir(), fileName);
}