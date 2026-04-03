/**
 * Notificaciones de canción favorita para React Native.
 * Usa expo-notifications en lugar de la Web Notification API.
 * Usa AsyncStorage en lugar de localStorage.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SongInfo {
  id: string;
  title: string;
  artist: string;
  art?: string;
}

type PermissionState = 'granted' | 'denied' | 'undetermined';

interface UseFavoriteNotifyReturn {
  isEnabled: boolean;
  permissionState: PermissionState;
  enable: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  disable: () => void;
}

const STORAGE_KEY_ENABLED = 'radio-favorite-notify';
const STORAGE_KEY_SONGS = 'radio-favorite-songs';

// Configurar comportamiento global de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Muestra una notificación nativa cuando empieza a sonar una canción favorita.
 *
 * @param currentSong - Canción en reproducción actualmente
 * @param favoriteSongKeys - Array de claves "artista::titulo" guardadas como favoritas
 */
export function useFavoriteNotify(
  currentSong: SongInfo | null,
  favoriteSongKeys: string[]
): UseFavoriteNotifyReturn {
  const [isEnabled, setIsEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>('undetermined');
  const lastNotifiedSongId = useRef<string | null>(null);

  // Leer estado guardado al montar
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY_ENABLED);
        if (stored === 'true') setIsEnabled(true);
      } catch { /* ignorar */ }

      // Leer permiso actual
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionState(status as PermissionState);
    })();
  }, []);

  const enable = useCallback(async (): Promise<{ granted: boolean; canAskAgain: boolean }> => {
    const { status: existing, canAskAgain: existingCanAskAgain } = await Notifications.getPermissionsAsync();

    if (existing === 'granted') {
      setPermissionState('granted');
      setIsEnabled(true);
      await AsyncStorage.setItem(STORAGE_KEY_ENABLED, 'true');
      return { granted: true, canAskAgain: existingCanAskAgain };
    }

    if (existingCanAskAgain || existing === 'undetermined') {
      const resp = await Notifications.requestPermissionsAsync();
      setPermissionState(resp.status as PermissionState);
      if (resp.status === 'granted') {
        setIsEnabled(true);
        await AsyncStorage.setItem(STORAGE_KEY_ENABLED, 'true');
        return { granted: true, canAskAgain: resp.canAskAgain };
      } else {
        return { granted: false, canAskAgain: resp.canAskAgain };
      }
    }

    setPermissionState('denied');
    return { granted: false, canAskAgain: false };
  }, []);

  const disable = useCallback(async () => {
    setIsEnabled(false);
    await AsyncStorage.setItem(STORAGE_KEY_ENABLED, 'false');
  }, []);

  // Detectar cambio de canción y mostrar notificación si es favorita
  useEffect(() => {
    if (!isEnabled) return;
    if (permissionState !== 'granted') return;
    if (!currentSong?.title || currentSong.title === 'Unknown') return;
    if (lastNotifiedSongId.current === currentSong.id) return;

    const songKey = `${currentSong.artist}::${currentSong.title}`.toLowerCase();
    const isFav = favoriteSongKeys.some((k) => k.toLowerCase() === songKey);
    if (!isFav) return;

    lastNotifiedSongId.current = currentSong.id;

    Notifications.scheduleNotificationAsync({
      content: {
        title: '🎵 Canción favorita en emisión',
        body: `${currentSong.title} — ${currentSong.artist}`,
      },
      trigger: null, // mostrar inmediatamente
    }).catch(() => { /* ignorar si el sistema no está disponible */ });
  }, [currentSong, isEnabled, permissionState, favoriteSongKeys]);

  return { isEnabled, permissionState, enable, disable };
}

/**
 * Helper para persistir/recuperar la lista de canciones favoritas locales.
 */
export async function loadFavoriteSongKeys(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SONGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveFavoriteSongKeys(keys: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(keys));
  } catch { /* ignorar */ }
}
