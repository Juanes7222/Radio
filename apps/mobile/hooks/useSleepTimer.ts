/**
 * Sleep timer for the radio stream. The target end time is persisted in
 * AsyncStorage so the timer survives background suspension and app restarts;
 * the remaining time is recomputed from the clock instead of counted down.
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
  remaining: number | null; // segundos restantes, null si está inactivo
  isActive: boolean;
  /**
   * 1 = tiempo completo, 0 = a punto de expirar. Es null cuando la duración
   * original es desconocida (temporizador restaurado desde un valor antiguo),
   * y los consumidores deben entonces omitir el arco en vez de inventarlo.
   */
  progress: number | null;
  start: (minutes: number) => void;
  cancel: () => void;
  /** Formato legible: "mm:ss" */
  display: string;
}

/**
 * Llama a `onExpire` cuando el temporizador llega a 0.
 */
export function useSleepTimer(onExpire: () => void): UseSleepTimerReturn {
  const [endTime, setEndTime] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  const startedRef = useRef(false);

  // Actualizar la ref en un efecto para no mutar durante el render
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const clear = useCallback(() => {
    setEndTime(null);
    setTotalSeconds(null);
    setRemaining(null);
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

  // Tick cada 5s mientras hay un timer activo. La precisión viene del reloj
  // (Date.now()), no del tick, así que un intervalo largo basta para refrescar
  // el display y reduce re-renders y wakeups del hilo JS.
  useEffect(() => {
    if (endTime === null) return;

    const tick = () => {
      const remainingMs = endTime - Date.now();
      if (remainingMs <= 0) {
        expire();
      } else {
        setRemaining(Math.ceil(remainingMs / 1000));
      }
    };

    tick();
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [endTime, expire]);

  // Al volver a foreground, recalcular con el reloj: los timers JS se
  // suspenden o retrasan en segundo plano y el tick pierde precisión.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || endTime === null) return;
      const remainingMs = endTime - Date.now();
      if (remainingMs <= 0) {
        expire();
      } else {
        setRemaining(Math.ceil(remainingMs / 1000));
      }
    });
    return () => subscription.remove();
  }, [endTime, expire]);

  // Restaurar un timer persistido que sobrevivió al cierre de la app.
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

  const display =
    remaining === null
      ? ''
      : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  const progress =
    remaining === null || totalSeconds === null || totalSeconds <= 0
      ? null
      : Math.min(1, Math.max(0, remaining / totalSeconds));

  return {
    remaining,
    isActive: endTime !== null,
    progress,
    start,
    cancel: clear,
    display,
  };
}
