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
export const STORAGE_KEY_SONGS = 'radio-favorite-songs';

/** Returns the lowercase "artist::title" key for a song. */
export function songKey(artist: string, title: string): string {
  return `${artist}::${title}`.toLowerCase();
}

/**
 * Fires a system notification when a favorited song starts playing.
 * `favoriteSongKeys` is the array of "artist::title" keys saved by the user.
 */
export function useFavoriteNotify(
  currentSong: SongInfo | null,
  favoriteSongKeys: string[]
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

  useEffect(() => {
    if (!isEnabled) return;
    if (!currentSong) return;
    if (permissionState !== 'granted') return;
    if (lastNotifiedSongId.current === currentSong.id) return;
    if (!currentSong.title || currentSong.title === 'Unknown') return;

    const key = songKey(currentSong.artist, currentSong.title);
    const isFav = favoriteSongKeys.some((k) => k.toLowerCase() === key);
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
      setTimeout(() => notification.close(), 8000);
    } catch {
      // Notifications blocked — ignore silently
    }
  }, [currentSong, isEnabled, permissionState, favoriteSongKeys]);

  return { isEnabled, permissionState, enable, disable };
}
