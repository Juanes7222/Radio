import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { FFMPEG_CONCAT_TIMEOUT_MS } from "../../shared/constants";

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 30_000;
const EBUR128_TIMEOUT_MS = 5 * 60_000;
const EDGE_FADE_FILTER = "tri";
/** Mild broadband noise reduction for recordings made on consumer hardware. */
const DENOISE_FILTER = "afftdn=nf=-25";
const OUTPUT_CODEC_ARGS = ["-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", "-ac", "2"];

export interface EpisodeProcessingOptions {
  /** Brings the episode to the configured emission loudness target. */
  normalizeLoudness: boolean;
  /** Reduces steady background hiss before the loudness measurement. */
  reduceNoise: boolean;
}

export interface ComposeEpisodeParams extends EpisodeProcessingOptions {
  /** Ordered parts: intro, episode body and outro. Empty parts are skipped. */
  parts: string[];
  outputPath: string;
  /** Crossfade applied at the seams of the composed episode, in seconds. */
  fadeSeconds: number;
}

export interface ComposedEpisode {
  durationSec: number;
  /** Integrated loudness of the result, or null when it was not measured. */
  integratedLoudnessDb: number | null;
}

interface LoudnessMeasurement {
  integratedDb: number;
  truePeakDb: number;
}

/** Duration of an audio file in seconds, or 0 when it cannot be read. */
export async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", filePath],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    const duration = Number(parsed.format?.duration ?? Number.NaN);
    return Number.isFinite(duration) ? duration : 0;
  } catch (err) {
    logger.warn("ProgramAudio", "Could not read audio duration", {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/** Escapes a path so it can be listed in a concat demuxer manifest. */
function toConcatEntry(filePath: string): string {
  return `file '${path.resolve(filePath).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
}

function lastNumber(text: string, pattern: RegExp): number | null {
  const matches = [...text.matchAll(pattern)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  const value = Number(last[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Measures integrated loudness and true peak with ebur128.
 *
 * `loudnorm` is deliberately not used to apply the gain: in ffmpeg its dynamic
 * and linear modes both discard the first ~3 s of the stream, which silently
 * eats the intro. A static volume gain is latency-free, so the measurement
 * drives the gain instead of the filter.
 */
async function measureLoudness(filePath: string): Promise<LoudnessMeasurement | null> {
  try {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-nostats", "-i", filePath, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
      { timeout: EBUR128_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
    );

    const integratedDb = lastNumber(stderr, /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
    const truePeakDb = lastNumber(stderr, /Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g);

    if (integratedDb === null || truePeakDb === null) return null;
    return { integratedDb, truePeakDb };
  } catch (err) {
    logger.warn("ProgramAudio", "Could not measure loudness", {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Gain that reaches the emission target without exceeding the peak ceiling.
 * The ceiling wins when the material is too dynamic for the target to be hit
 * safely, so the episode is quieter than asked rather than clipping.
 */
export function computeLoudnessGain(
  measurement: LoudnessMeasurement,
  targetDb: number,
  ceilingDb: number,
  maxGainDb: number
): number {
  const gainForTarget = targetDb - measurement.integratedDb;
  const gainForCeiling = ceilingDb - measurement.truePeakDb;
  return roundDb(Math.min(gainForTarget, gainForCeiling, maxGainDb));
}

function roundDb(value: number): number {
  return Math.round(value * 100) / 100;
}

const GAIN_EPSILON_DB = 0.2;

/**
 * Joins the parts of an episode into a single MP3 with uniform encoding,
 * optionally reduces hiss and brings the result to the emission loudness, then
 * applies the crossfade on the outer edges so the intro and the outro do not
 * start or end abruptly.
 *
 * The sources come from non-professional recordings, so the audio is always
 * re-encoded instead of stream-copied: sample rates and bitrates differ and a
 * copy would produce a file that skips on some players.
 *
 * Runs at most two encoding passes: the concat pass carries the noise
 * reduction, and a second pass applies the measured gain together with the
 * fades. The measurement in between decodes without writing, so it is cheap.
 */
export async function composeEpisode({
  parts,
  outputPath,
  fadeSeconds,
  normalizeLoudness,
  reduceNoise,
}: ComposeEpisodeParams): Promise<ComposedEpisode> {
  const usableParts = parts.filter((part) => part.length > 0);
  if (usableParts.length === 0) {
    throw new Error("No hay audio para componer el episodio.");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const manifestPath = `${outputPath}.concat.txt`;
  const joinedPath = `${outputPath}.joined.mp3`;

  try {
    await fs.writeFile(manifestPath, `${usableParts.map(toConcatEntry).join("\n")}\n`, "utf8");

    const denoiseFilter = reduceNoise ? DENOISE_FILTER : null;
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        manifestPath,
        ...(denoiseFilter ? ["-af", denoiseFilter] : []),
        ...OUTPUT_CODEC_ARGS,
        joinedPath,
      ],
      { timeout: FFMPEG_CONCAT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
    );

    const durationSec = await probeDuration(joinedPath);
    if (durationSec <= 0) {
      throw new Error("El archivo compuesto tiene duración cero.");
    }

    let gainDb = 0;
    if (normalizeLoudness) {
      const measurement = await measureLoudness(joinedPath);
      if (measurement) {
        gainDb = computeLoudnessGain(
          measurement,
          config.programs.loudnessTargetDb,
          config.programs.loudnessCeilingDb,
          config.programs.loudnessMaxGainDb
        );
      } else {
        logger.warn("ProgramAudio", "Loudness could not be measured, episode left untouched");
      }
    }

    const applyFilters = buildApplyFilters({
      gainDb: Math.abs(gainDb) > GAIN_EPSILON_DB ? gainDb : null,
      fadeSeconds,
      durationSec,
    });

    if (applyFilters === null) {
      await fs.rename(joinedPath, outputPath);
    } else {
      await runFilterPass(joinedPath, outputPath, applyFilters);
      await fs.rm(joinedPath, { force: true });
    }

    const finalDurationSec = await probeDuration(outputPath);
    if (finalDurationSec <= 0) {
      throw new Error("El archivo compuesto tiene duración cero.");
    }

    return {
      durationSec: finalDurationSec,
      integratedLoudnessDb: normalizeLoudness ? config.programs.loudnessTargetDb : null,
    };
  } finally {
    await fs.rm(manifestPath, { force: true });
  }
}

function buildApplyFilters(params: {
  gainDb: number | null;
  fadeSeconds: number;
  durationSec: number;
}): string | null {
  const filters: string[] = [];
  if (params.gainDb !== null) filters.push(`volume=${params.gainDb}dB`);
  if (params.fadeSeconds > 0) {
    const fadeStart = Math.max(0, params.durationSec - params.fadeSeconds);
    filters.push(`afade=t=in:st=0:d=${params.fadeSeconds}:curve=${EDGE_FADE_FILTER}`);
    filters.push(`afade=t=out:st=${fadeStart}:d=${params.fadeSeconds}:curve=${EDGE_FADE_FILTER}`);
  }
  return filters.length > 0 ? filters.join(",") : null;
}

async function runFilterPass(inputPath: string, outputPath: string, filters: string): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    ["-y", "-v", "error", "-i", inputPath, "-af", filters, ...OUTPUT_CODEC_ARGS, outputPath],
    { timeout: FFMPEG_CONCAT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
  );
}