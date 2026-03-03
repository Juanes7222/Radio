/**
 * Temporizador de apagado — port directo del hook web.
 * No depende de ninguna API de navegador, funciona igual en React Native.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

export const SLEEP_PRESETS = [15, 30, 60, 90] as const; // minutos

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
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef = useRef(onExpire);

  // Actualizar la ref en un efecto para no mutar durante el render
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clear();
    setRemaining(null);
  }, [clear]);

  const start = useCallback(
    (minutes: number) => {
      clear();
      const totalSeconds = minutes * 60;
      setRemaining(totalSeconds);

      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            onExpireRef.current();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clear]
  );

  // Limpiar al desmontar
  useEffect(() => () => clear(), [clear]);

  const display =
    remaining === null
      ? ''
      : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  return {
    remaining,
    isActive: remaining !== null,
    start,
    cancel,
    display,
  };
}
