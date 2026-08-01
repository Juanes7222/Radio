import axios from 'axios';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { config } from '../config';

const execAsync = promisify(exec);

export interface SynthesizeParams {
  text: string;
  voice?: string;
  speed?: number;
  outputPath: string;
}

export interface SynthesizeResult {
  duration_ms: number;
  file_size_bytes: number;
}

export async function synthesize({
  text,
  voice = 'ef_dora',
  speed = 0.85,
  outputPath,
}: SynthesizeParams): Promise<SynthesizeResult> {
  const KOKORO_URL = config.locutor.kokoroUrl;

  try {
    const response = await axios.post(
      `${KOKORO_URL}/v1/audio/speech`,
      { model: 'kokoro', input: text, voice, speed, response_format: 'mp3' },
      { responseType: 'arraybuffer', timeout: 60000 }
    );

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(outputPath, Buffer.from(response.data));

    const duration = await getAudioDuration(outputPath);
    const stat = await fs.stat(outputPath);

    return {
      duration_ms: Math.round(duration * 1000),
      file_size_bytes: stat.size,
    };
  } catch (error: any) {
    console.error('Error in TTS synthesis:', error.message);
    throw error;
  }
}

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`
    );
    const data = JSON.parse(stdout);
    const duration = data.format?.duration;
    if (duration) return parseFloat(duration);
  } catch {
    console.warn(`Could not get duration for ${filePath}, falling back to 0`);
  }
  return 0;
}

/**
 * Appends a fixed amount of silence to the end of an MP3 file.
 * A silence tail gives Liquidsoap a clean handoff back to the
 * auto-DJ when the live harbor source ends, avoiding abrupt cuts.
 */
export async function padSilenceTail(
  inputPath: string,
  outputPath: string,
  seconds: number
): Promise<void> {
  await execAsync(
    `ffmpeg -y -v error -i "${inputPath}" -af "apad=pad_dur=${seconds}" -c:a libmp3lame "${outputPath}"`
  );
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

  await execAsync(
    `ffmpeg -y -v error -stream_loop -1 -i "${bedPath}" -i "${voicePath}" ` +
      `-filter_complex ` +
      `"[0:a]volume=${bedVolume}[bed];` +
      `[1:a]afade=t=in:d=0.3,afade=t=out:st=${fadeOutStart}:d=0.5[voice];` +
      `[voice][bed]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[out]" ` +
      `-map "[out]" -t ${totalSeconds} -c:a libmp3lame "${outputPath}"`
  );
}
