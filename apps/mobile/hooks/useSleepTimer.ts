/**
 * Sleep timer for the radio stream. The target end time is persisted in
 * AsyncStorage so the timer survives background suspension and app restarts.
 * The hook only keeps the end time and stops the music when the timer runs
 * out (even when the bubble is not mounted); the countdown itself lives in
 * SleepTimerBubble.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SLEEP_PRESETS = [15, 30, 60, 90] as const; // minutos

const END_TIME_KEY = 'sleep-timer-end-time';

/**
 * Stored shape. `totalSeconds` rides along with `endTime` so a restored timer
 * can still show how much of the original preset is left. Values written by an
 * older build are a bare timestamp string, so parsing stays defensive.
 */
interface StoredTimer {
  endTime: number;
  totalSeconds: number | null;
}

function parseStoredTimer(raw: string | null): StoredTimer | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const { endTime, totalSeconds } = parsed as Record<string, unknown>;
      if (typeof endTime !== 'number' || !Number.isFinite(endTime)) return null;
      return {
        endTime,
        totalSeconds: typeof totalSeconds === 'number' && Number.isFinite(totalSeconds) ? totalSeconds : null,
      };
    } catch {
      return null;
    }
  }

  const legacy = Number(trimmed);
  return Number.isFinite(legacy) ? { endTime: legacy, totalSeconds: null } : null;
}

function writeStoredTimer(endTime: number, totalSeconds: number): void {
  AsyncStorage.setItem(
    END_TIME_KEY,
    JSON.stringify({ endTime, totalSeconds } satisfies StoredTimer)
  ).catch(() => {});
}

interface UseSleepTimerReturn {
  endTime: number | null;
  totalSeconds: number | null;
  isActive: boolean;
  start: (minutes: number) => void;
  cancel: () => void;
}

/**
 * Llama a `onExpire` cuando el temporizador llega a 0.
 */
export function useSleepTimer(onExpire: () => void): UseSleepTimerReturn {
  const [endTime, setEndTime] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  const startedRef = useRef(false);

  // Actualizar la ref en un efecto para no mutar durante el render
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const clear = useCallback(() => {
    setEndTime(null);
    setTotalSeconds(null);
    AsyncStorage.removeItem(END_TIME_KEY).catch(() => {});
  }, []);

  const expire = useCallback(() => {
    clear();
    onExpireRef.current();
  }, [clear]);

  const start = useCallback((minutes: number) => {
    startedRef.current = true;
    const total = minutes * 60;
    const newEndTime = Date.now() + total * 1000;
    setEndTime(newEndTime);
    setTotalSeconds(total);
    writeStoredTimer(newEndTime, total);
  }, []);

  // Expiry check every 5s. Precision comes from the clock (Date.now()), not
  // the tick, so a long interval is enough to stop the music in time without
  // re-rendering the screen every second.
  useEffect(() => {
    if (endTime === null) return;

    const tick = () => {
      if (Date.now() >= endTime) {
        expire();
      }
    };

    tick();
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [endTime, expire]);

  // When returning to the foreground, recalculate from the clock: JS timers
  // suspend or delay in the background and the tick loses precision.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || endTime === null) return;
      if (Date.now() >= endTime) {
        expire();
      }
    });
    return () => subscription.remove();
  }, [endTime, expire]);

  // Restore a persisted timer that survived app closure.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(END_TIME_KEY).then((raw) => {
      if (!mounted || startedRef.current) return;
      const persisted = parseStoredTimer(raw);
      if (!persisted) return;
      if (persisted.endTime <= Date.now()) {
        AsyncStorage.removeItem(END_TIME_KEY).catch(() => {});
        onExpireRef.current();
      } else {
        setEndTime(persisted.endTime);
        setTotalSeconds(persisted.totalSeconds);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    endTime,
    totalSeconds,
    isActive: endTime !== null,
    start,
    cancel: clear,
  };
}
