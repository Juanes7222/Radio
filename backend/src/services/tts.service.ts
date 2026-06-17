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
  speed = 0.95,
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
