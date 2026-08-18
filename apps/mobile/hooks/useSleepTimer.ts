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

interface UseSleepTimerReturn {
  remaining: number | null; // segundos restantes, null si está inactivo
  isActive: boolean;
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
  const [remaining, setRemaining] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  const startedRef = useRef(false);

  // Actualizar la ref en un efecto para no mutar durante el render
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const expire = useCallback(() => {
    setEndTime(null);
    setRemaining(null);
    AsyncStorage.removeItem(END_TIME_KEY).catch(() => {});
    onExpireRef.current();
  }, []);

  const cancel = useCallback(() => {
    setEndTime(null);
    setRemaining(null);
    AsyncStorage.removeItem(END_TIME_KEY).catch(() => {});
  }, []);

  const start = useCallback((minutes: number) => {
    startedRef.current = true;
    const newEndTime = Date.now() + minutes * 60 * 1000;
    setEndTime(newEndTime);
    AsyncStorage.setItem(END_TIME_KEY, String(newEndTime)).catch(() => {});
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
      const persisted = raw ? Number(raw) : NaN;
      if (!Number.isFinite(persisted)) return;
      if (persisted <= Date.now()) {
        AsyncStorage.removeItem(END_TIME_KEY).catch(() => {});
        onExpireRef.current();
      } else {
        setEndTime(persisted);
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

  return {
    remaining,
    isActive: endTime !== null,
    start,
    cancel,
    display,
  };
}
