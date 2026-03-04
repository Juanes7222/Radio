import { useEffect, useRef, useState, useCallback } from 'react';

interface SongInfo {
  id: string;
  title: string;
  artist: string;
  art?: string;
}

interface UseFavoriteNotifyReturn {
  isEnabled: boolean;
  permissionState: NotificationPermission | 'unsupported';
  enable: () => Promise<boolean>;
  disable: () => void;
}

const STORAGE_KEY = 'radio-favorite-notify';

/**
 * Muestra una notificación del sistema cuando comienza a sonar
 * una canción que el usuario marcó como favorita.
 *
 * `favorites` debe ser el array de IDs de la estación favorita del usuario;
 * `currentSong` es la canción actualmente en reproducción.
 */
export function useFavoriteNotify(
  currentSong: SongInfo | null,
  favorites: number[]
): UseFavoriteNotifyReturn {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
    () => {
      if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
      // Leer el permiso actual directamente en el inicializador (no en un efecto)
      return Notification.permission;
    }
  );

  const lastNotifiedSongId = useRef<string | null>(null);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'denied') return false;

    if (Notification.permission !== 'granted') {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result !== 'granted') return false;
    }

    setIsEnabled(true);
    localStorage.setItem(STORAGE_KEY, 'true');
    return true;
  }, []);

  const disable = useCallback(() => {
    setIsEnabled(false);
    localStorage.setItem(STORAGE_KEY, 'false');
  }, []);

  // Detectar cambio de canción y notificar si es favorita
  useEffect(() => {
    if (!isEnabled) return;
    if (!currentSong) return;
    if (permissionState !== 'granted') return;

    // Ya notificamos esta canción
    if (lastNotifiedSongId.current === currentSong.id) return;

    // Revisar si tiene título con contenido (algunos streams dan IDs sin título)
    if (!currentSong.title || currentSong.title === 'Unknown') return;

    // La lista de favoritos de esta app guarda IDs de estación, no de canción.
    // Para notificar favoritos de canción usamos un set guardado en localStorage.
    const favoriteSongs: string[] = JSON.parse(
      localStorage.getItem('radio-favorite-songs') || '[]'
    );

    const songKey = `${currentSong.artist}::${currentSong.title}`.toLowerCase();
    const isFav =
      favoriteSongs.some((k) => k.toLowerCase() === songKey) || favorites.length > 0;

    if (!isFav) return;

    lastNotifiedSongId.current = currentSong.id;

    try {
      const notification = new Notification('🎵 Canción favorita en emisión', {
        body: `${currentSong.title} — ${currentSong.artist}`,
        icon: currentSong.art || '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'favorite-song',
        silent: false,
      });

      // Auto-cerrar a los 8 segundos
      setTimeout(() => notification.close(), 8000);
    } catch {
      // Notificaciones bloqueadas en este momento — ignorar silenciosamente
    }
  }, [currentSong, isEnabled, permissionState, favorites]);

  return { isEnabled, permissionState, enable, disable };
}
