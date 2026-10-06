import fs from "fs/promises";
import path from "path";
import { config } from "../../config";
import { AppError } from "../../shared/errors/app-error";
import { COMPOSED_EPISODE_FILE } from "./program.constants";

/**
 * Scratch directory of one episode. ffmpeg writes the uploaded source and the
 * composed MP3 here; the composed file is what the admin previews and what
 * later reaches AzuraCast, so it must survive between the two steps.
 */
export async function createEpisodeTempDir(episodeId: string): Promise<string> {
  const dir = path.join(config.programs.tempDir, episodeId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function episodeTempDir(episodeId: string): string {
  return path.join(config.programs.tempDir, episodeId);
}

/** Absolute path of the composed episode ready to be published. */
export function composedEpisodePath(episodeId: string): string {
  return path.join(episodeTempDir(episodeId), COMPOSED_EPISODE_FILE);
}

/** True when the composed file is still on disk. */
export async function composedEpisodeExists(episodeId: string): Promise<boolean> {
  try {
    await fs.access(composedEpisodePath(episodeId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the composed file of an episode, failing with a message the admin
 * can act on: the machine may have been rebooted and cleared the scratch dir.
 */
export async function requireComposedEpisode(episodeId: string): Promise<string> {
  const filePath = composedEpisodePath(episodeId);
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(
      409,
      "El audio compuesto ya no está en el servidor. Vuelve a prepararlo antes de publicar."
    );
  }
  return filePath;
}

/** Removes the scratch directory of one episode, ignoring missing files. */
export async function cleanupEpisodeTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export async function cleanupEpisodeTempDirById(episodeId: string): Promise<void> {
  await cleanupEpisodeTempDir(episodeTempDir(episodeId));
}