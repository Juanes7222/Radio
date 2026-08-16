import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StreamQuality } from '@radio/types';

const QUALITY_KEY = 'stream-quality';
const DEFAULT_QUALITY: StreamQuality = '128';

interface UseStreamQualityReturn {
  quality: StreamQuality;
  setQuality: (quality: StreamQuality) => void;
}

/**
 * Selected stream quality for the player, persisted across restarts.
 * Falls back to a valid option when the station stops exposing the
 * currently selected quality.
 */
export function useStreamQuality(availableQualities: StreamQuality[]): UseStreamQualityReturn {
  const [quality, setQualityState] = useState<StreamQuality>(DEFAULT_QUALITY);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(QUALITY_KEY).then((raw) => {
      if (!mounted) return;
      if (raw === '64' || raw === '128' || raw === '320') {
        setQualityState(raw);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (availableQualities.length === 0 || availableQualities.includes(quality)) return;
    const fallback = availableQualities.includes(DEFAULT_QUALITY)
      ? DEFAULT_QUALITY
      : availableQualities[0];
    setQualityState(fallback);
  }, [availableQualities, quality]);

  const setQuality = useCallback((next: StreamQuality) => {
    setQualityState(next);
    AsyncStorage.setItem(QUALITY_KEY, next).catch(() => {});
  }, []);

  return { quality, setQuality };
}
