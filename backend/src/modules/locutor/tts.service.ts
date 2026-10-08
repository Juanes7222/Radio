import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { elevenLabsProvider, getElevenLabsStatus } from "./tts/elevenLabs.provider";
import { isKokoroReachable, kokoroProvider } from "./tts/kokoro.provider";
import type { TtsProvider, TtsProviderId } from "./tts/tts.types";

const execFileAsync = promisify(execFile);

const LOG = "TtsService";

/**
 * Fixed order: the external provider first, Kokoro as the fallback. A provider
 * that reports itself unavailable is skipped without a request, so a station
 * with no ElevenLabs key configured behaves exactly as it did before.
 */
const PROVIDERS: TtsProvider[] = [elevenLabsProvider, kokoroProvider];

let lastProvider: TtsProviderId | null = null;
let lastProviderAt: Date | null = null;
let fallbackCount = 0;

export interface SynthesizeParams {
  text: string;
  voice?: string;
  speed?: number;
  outputPath: string;
}

export interface SynthesizeResult {
  provider: TtsProviderId;
  /** Voice that produced the file, qualified with its provider. */
  voice: string;
  durationMs: number;
  fileSizeBytes: number;
}

/**
 * The provider that would answer a synthesis right now. The audio bank reuses
 * only files produced by this one: a Kokoro recording left in the bank would
 * otherwise keep playing after the good voice became available, and the
 * station would sound robotic for weeks with nothing pointing at the cause.
 */
export function preferredProviderId(templateVoice: string | null): TtsProviderId {
  return PROVIDERS.find((provider) => provider.isAvailable(templateVoice))?.id ?? "kokoro";
}

export async function synthesize({
  text,
  voice = config.locutor.tts.defaultVoice,
  speed = config.locutor.tts.defaultSpeed,
  outputPath,
}: SynthesizeParams): Promise<SynthesizeResult> {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("No hay texto que locutar");
  }

  if (trimmed.length > config.locutor.tts.maxTextLength) {
    throw new Error(
      `El texto supera los ${config.locutor.tts.maxTextLength} caracteres permitidos (${trimmed.length})`
    );
  }

  const firstChoice = preferredProviderId(voice);
  let lastError: Error | null = null;

  for (const provider of PROVIDERS) {
    if (!provider.isAvailable(voice)) continue;

    try {
      const output = await provider.synthesize({ text: trimmed, templateVoice: voice, speed });

      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, output.audio);

      const [duration, stat] = await Promise.all([
        getAudioDuration(outputPath),
        fs.stat(outputPath),
      ]);

      if (provider.id !== firstChoice) {
        fallbackCount += 1;
        logger.warn(LOG, "Falling back to another voice engine", {
          preferred: firstChoice,
          used: provider.id,
          reason: lastError?.message,
          fallbackCount,
        });
      }

      lastProvider = provider.id;
      lastProviderAt = new Date();

      return {
        provider: provider.id,
        voice: output.voice,
        durationMs: Math.round(duration * 1000),
        fileSizeBytes: stat.size,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(LOG, "Voice engine failed, trying the next one", {
        provider: provider.id,
        error: lastError.message,
      });
    }
  }

  logger.error(LOG, "Every voice engine failed", {
    error: lastError?.message ?? "no provider available",
  });

  throw lastError ?? new Error("No hay ningún motor de voz disponible");
}

export interface TtsRuntimeStatus {
  preferredProvider: TtsProviderId;
  lastProvider: TtsProviderId | null;
  lastProviderAt: string | null;
  fallbackCount: number;
  kokoroReachable: boolean;
  elevenLabs: ReturnType<typeof getElevenLabsStatus>;
}

/**
 * Live state of the voice chain for the admin panel. Reading the balance here
 * is what makes the credit burn visible before it turns into a station that
 * quietly fell back to the robotic voice for a month.
 */
export async function getTtsStatus(): Promise<TtsRuntimeStatus> {
  return {
    preferredProvider: preferredProviderId(null),
    lastProvider,
    lastProviderAt: lastProviderAt ? lastProviderAt.toISOString() : null,
    fallbackCount,
    kokoroReachable: await isKokoroReachable(),
    elevenLabs: getElevenLabsStatus(),
  };
}

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      filePath,
    ]);
    const data = JSON.parse(stdout);
    const duration = data.format?.duration;
    if (duration) return parseFloat(duration);
  } catch {
    logger.warn(LOG, `Could not get duration for ${filePath}, falling back to 0`);
  }
  return 0;
}

/**
 * Appends a fixed amount of silence to the end of an MP3 file.
 * A silence tail gives Liquidsoap a clean handoff back to the
 * auto-DJ when the live harbor source ends, avoiding abrupt cuts.
 */
export async function padSilenceTail(inputPath: string, outputPath: string, seconds: number): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    inputPath,
    "-af",
    `apad=pad_dur=${seconds}`,
    "-c:a",
    "libmp3lame",
    outputPath,
  ]);
}

export interface MixWithBedParams {
  voicePath: string;
  bedPath: string;
  outputPath: string;
  durationSeconds: number;
  bedVolume?: number;
  tailSeconds?: number;
}

/**
 * Mixes a voice track over an instrumental bed, with a fade-in on
 * the voice, a fade-out before the end, and a bed-only tail so the
 * transition back to the auto-DJ is seamless.
 */
export async function mixWithBed({
  voicePath,
  bedPath,
  outputPath,
  durationSeconds,
  bedVolume = 0.15,
  tailSeconds = 3,
}: MixWithBedParams): Promise<void> {
  const totalSeconds = durationSeconds + tailSeconds;
  const fadeOutStart = Math.max(0, durationSeconds - 0.5);

  const filter = [
    `[0:a]volume=${bedVolume}[bed];`,
    `[1:a]afade=t=in:d=0.3,afade=t=out:st=${fadeOutStart}:d=0.5[voice];`,
    `[voice][bed]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[out]`,
  ].join("");

  await execFileAsync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-stream_loop",
    "-1",
    "-i",
    bedPath,
    "-i",
    voicePath,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-t",
    String(totalSeconds),
    "-c:a",
    "libmp3lame",
    outputPath,
  ]);
}
