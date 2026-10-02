import type { StreamQuality } from '@radio/types';

const VOLUME_KEY = 'radio-player-volume';
const QUALITY_KEY = 'radio-player-quality';

const MIN_VOLUME = 0;
const MAX_VOLUME = 100;
const QUALITIES: readonly StreamQuality[] = ['64', '128', '320'];

export const DEFAULT_VOLUME = 80;
export const DEFAULT_QUALITY: StreamQuality = '128';

function toVolume(value: unknown): number | null {
  const parsed = Number(value);
  if (value === null || value === '' || !Number.isFinite(parsed)) return null;
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, Math.round(parsed)));
}

function toQuality(value: unknown): StreamQuality | null {
  return QUALITIES.includes(value as StreamQuality) ? (value as StreamQuality) : null;
}

export function readVolume(): number {
  try {
    return toVolume(localStorage.getItem(VOLUME_KEY)) ?? DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function writeVolume(volume: number): void {
  const safe = toVolume(volume);
  if (safe === null) return;
  try {
    localStorage.setItem(VOLUME_KEY, String(safe));
  } catch {
    // Storage unavailable (private mode, quota) — preferences are not persisted.
  }
}

export function readQuality(): StreamQuality {
  try {
    return toQuality(localStorage.getItem(QUALITY_KEY)) ?? DEFAULT_QUALITY;
  } catch {
    return DEFAULT_QUALITY;
  }
}

export function writeQuality(quality: StreamQuality): void {
  const safe = toQuality(quality);
  if (safe === null) return;
  try {
    localStorage.setItem(QUALITY_KEY, safe);
  } catch {
    // Storage unavailable (private mode, quota) — preferences are not persisted.
  }
}
