import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { config } from "../../config";
import { logger } from "../../utils/logger";

const execFileAsync = promisify(execFile);

export async function downloadAsMp3(videoId: string): Promise<string> {
  const outputDir = config.processing.tempDir;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputTemplate = path.join(outputDir, `${videoId}.%(ext)s`);
  const expectedPath = path.join(outputDir, `${videoId}.mp3`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  logger.info("DownloadService", "Starting download", { videoId });

  await execFileAsync(
    "yt-dlp",
    [
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--no-playlist",
      "-o", outputTemplate,
      url,
    ],
    { timeout: 300_000 }
  );

  if (!fs.existsSync(expectedPath)) {
    throw new Error(`MP3 file not found after download: ${expectedPath}`);
  }

  logger.info("DownloadService", "Download complete", { videoId, path: expectedPath });
  return expectedPath;
}

export function cleanupLocalFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn("DownloadService", "Could not delete temp file", { filePath, error: String(err) });
  }
}