import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { logger } from "../../../shared/logger/logger";

let ffmpegAvailable: boolean | null = null;

function isFfmpegAvailable(): boolean {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpeg = require("fluent-ffmpeg") as any;
    // Try to locate ffmpeg binary; if not found, fluent-ffmpeg will error on execution
    // We check by requiring and verifying it can be loaded
    ffmpegAvailable = !!ffmpeg;
    // Also try to check if ffprobe is accessible via which/where
    // Fallback to true — actual availability is tested at transcode time
    return ffmpegAvailable;
  } catch {
    ffmpegAvailable = false;
    return false;
  }
}

interface TranscodeResult {
  outputPath: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  size: number;
  posterPath: string | null;
}

/**
 * Probes video metadata using ffprobe.
 */
function probeVideo(inputPath: string): Promise<{ width: number | null; height: number | null; durationMs: number | null }> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffmpeg = require("fluent-ffmpeg") as any;
      ffmpeg.ffprobe(inputPath, (err: Error | null, metadata: any) => {
        if (err || !metadata) {
          resolve({ width: null, height: null, durationMs: null });
          return;
        }
        const videoStream = metadata.streams?.find((s: any) => s.codec_type === "video");
        const duration = metadata.format?.duration ? Math.round(Number(metadata.format.duration) * 1000) : null;
        resolve({
          width: videoStream?.width ?? null,
          height: videoStream?.height ?? null,
          durationMs: duration,
        });
      });
    } catch {
      resolve({ width: null, height: null, durationMs: null });
    }
  });
}

/**
 * Transcodes video to optimized 720p H.264 with faststart and generates a poster thumbnail.
 * If ffmpeg is unavailable or transcoding fails, returns the original file path.
 */
export async function optimizeVideo(
  inputBuffer: Buffer,
  originalName: string,
  workDir: string,
  outputBaseName: string
): Promise<TranscodeResult & { usedTranscode: boolean }> {
  const inputExt = path.extname(originalName) || ".mp4";
  const tempInputPath = path.join(os.tmpdir(), `${outputBaseName}_input${inputExt}`);
  const tempOutputPath = path.join(workDir, `${outputBaseName}.mp4`);
  const tempPosterPath = path.join(workDir, `${outputBaseName}_poster.webp`);

  try {
    fs.writeFileSync(tempInputPath, inputBuffer);
  } catch (err) {
    logger.error("NoticeVideoTranscode", "Failed to write temp input", { error: String(err) });
    throw err;
  }

  // If ffmpeg is not available, skip optimization
  if (!isFfmpegAvailable()) {
    const probe = await probeVideo(tempInputPath);
    try {
      fs.unlinkSync(tempInputPath);
    } catch {}
    // Fallback: caller will handle copying original
    return {
      outputPath: tempInputPath,
      width: probe.width,
      height: probe.height,
      durationMs: probe.durationMs,
      size: inputBuffer.length,
      posterPath: null,
      usedTranscode: false,
    };
  }

  const probeBefore = await probeVideo(tempInputPath);

  const transcodeSuccess = await new Promise<boolean>((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffmpeg = require("fluent-ffmpeg") as any;
      ffmpeg(tempInputPath)
        .outputOptions([
          "-c:v libx264",
          "-crf 28",
          "-preset fast",
          "-vf scale=1280:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-c:a aac",
          "-b:a 128k",
          "-movflags +faststart",
          "-maxrate 1500k",
          "-bufsize 3000k",
          "-pix_fmt yuv420p",
        ])
        .output(tempOutputPath)
        .on("end", () => resolve(true))
        .on("error", (err: Error) => {
          logger.error("NoticeVideoTranscode", "Transcode failed, falling back to original", { error: String(err) });
          resolve(false);
        })
        .run();
    } catch (err) {
      logger.error("NoticeVideoTranscode", "Transcode exception", { error: String(err) });
      resolve(false);
    }
  });

  // Generate poster thumbnail (first frame at 1s)
  let posterPath: string | null = null;
  if (transcodeSuccess || fs.existsSync(tempInputPath)) {
    const sourceForPoster = transcodeSuccess && fs.existsSync(tempOutputPath) ? tempOutputPath : tempInputPath;
    const posterGenerated = await new Promise<boolean>((resolve) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ffmpeg = require("fluent-ffmpeg") as any;
        ffmpeg(sourceForPoster)
          .screenshots({
            timestamps: ["00:00:01"],
            filename: path.basename(tempPosterPath),
            folder: path.dirname(tempPosterPath),
            size: "640x?",
          })
          .on("end", () => resolve(true))
          .on("error", () => resolve(false));
      } catch {
        resolve(false);
      }
    });
    if (posterGenerated && fs.existsSync(tempPosterPath)) {
      // Convert poster to WebP if it's not already (ffmpeg screenshots default to png/jpg)
      // Try to optimize with sharp if available
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sharpLib = require("sharp") as any;
        const posterBuffer = fs.readFileSync(tempPosterPath);
        // If poster was jpg/png, convert to webp
        if (!tempPosterPath.endsWith(".webp")) {
          const webpPath = tempPosterPath + ".webp";
          await sharpLib(posterBuffer).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toFile(webpPath);
          try {
            fs.unlinkSync(tempPosterPath);
          } catch {}
          posterPath = webpPath;
        } else {
          posterPath = tempPosterPath;
        }
      } catch {
        posterPath = tempPosterPath;
      }
    }
  }

  let finalOutputPath: string;
  let finalSize: number;
  let width = probeBefore.width;
  let height = probeBefore.height;
  let durationMs = probeBefore.durationMs;

  if (transcodeSuccess && fs.existsSync(tempOutputPath)) {
    const stat = fs.statSync(tempOutputPath);
    finalOutputPath = tempOutputPath;
    finalSize = stat.size;
    // Re-probe optimized file for accurate dimensions
    const probeAfter = await probeVideo(tempOutputPath);
    width = probeAfter.width ?? width;
    height = probeAfter.height ?? height;
    durationMs = probeAfter.durationMs ?? durationMs;
    // Cleanup temp input
    try {
      fs.unlinkSync(tempInputPath);
    } catch {}
  } else {
    // Use original
    finalOutputPath = tempInputPath;
    finalSize = inputBuffer.length;
    // Cleanup failed output if exists
    try {
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch {}
  }

  return {
    outputPath: finalOutputPath,
    width,
    height,
    durationMs,
    size: finalSize,
    posterPath,
    usedTranscode: transcodeSuccess,
  };
}

/**
 * Cleans up temporary files created during optimization.
 */
export function cleanupTempFiles(paths: Array<string | null>): void {
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }
}
