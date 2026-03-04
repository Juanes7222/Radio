import { useEffect, useCallback } from 'react';

interface MediaSessionConfig {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
}

export function useMediaSession({
  title,
  artist,
  album = '',
  artwork = '',
  onPlay,
  onPause,
  onStop,
  onSeekBackward,
  onSeekForward,
}: MediaSessionConfig) {
  // Actualizar metadata
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const defaultArtwork = '/default-album-art.png';
    const artworkUrl = artwork || defaultArtwork;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Radio Stream',
      artist: artist || 'Desconocido',
      album: album || 'Radio Online',
      artwork: [
        { src: artworkUrl, sizes: '96x96', type: 'image/png' },
        { src: artworkUrl, sizes: '128x128', type: 'image/png' },
        { src: artworkUrl, sizes: '192x192', type: 'image/png' },
        { src: artworkUrl, sizes: '256x256', type: 'image/png' },
        { src: artworkUrl, sizes: '384x384', type: 'image/png' },
        { src: artworkUrl, sizes: '512x512', type: 'image/png' },
      ],
    });
  }, [title, artist, album, artwork]);

  // Configurar handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const mediaSession = navigator.mediaSession;

    if (onPlay) {
      mediaSession.setActionHandler('play', onPlay);
    }
    if (onPause) {
      mediaSession.setActionHandler('pause', onPause);
    }
    if (onStop) {
      mediaSession.setActionHandler('stop', onStop);
    }
    if (onSeekBackward) {
      mediaSession.setActionHandler('seekbackward', onSeekBackward);
    }
    if (onSeekForward) {
      mediaSession.setActionHandler('seekforward', onSeekForward);
    }

    // Limpiar handlers al desmontar
    return () => {
      mediaSession.setActionHandler('play', null);
      mediaSession.setActionHandler('pause', null);
      mediaSession.setActionHandler('stop', null);
      mediaSession.setActionHandler('seekbackward', null);
      mediaSession.setActionHandler('seekforward', null);
    };
  }, [onPlay, onPause, onStop, onSeekBackward, onSeekForward]);

  // Función para actualizar estado de reproducción
  const setPlaybackState = useCallback((isPlaying: boolean) => {
    if (!('mediaSession' in navigator)) return;
    
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, []);

  return { setPlaybackState };
}
