import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "../../config";
import { logger } from "../../utils/logger";

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  duration: number;
  title: string;
  isAvailable: boolean;
}

export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      ["--dump-json", "--no-playlist", url],
      { timeout: 30_000 }
    );

    const meta = JSON.parse(stdout);
    return {
      duration: meta.duration ?? 0,
      title: meta.title ?? "",
      isAvailable: true,
    };
  } catch (err) {
    logger.warn("MetadataService", "Could not fetch metadata", { videoId, error: String(err) });
    return { duration: 0, title: "", isAvailable: false };
  }
}

export function exceedsMaxDuration(durationSeconds: number): boolean {
  return durationSeconds > config.processing.maxDurationSeconds;
}