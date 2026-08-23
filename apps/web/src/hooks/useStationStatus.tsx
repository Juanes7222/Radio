import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAdminApi } from './useAdminApi';
import type { NowPlayingData } from '@radio/types';

const POLL_INTERVAL_MS = 20000;

interface StationStatusValue {
  nowPlaying: NowPlayingData | null;
  loading: boolean;
  refresh: () => void;
}

const StationStatusContext = createContext<StationStatusValue | null>(null);

/**
 * Shares a single now-playing poll (topbar strip + dashboard) instead of
 * one interval per consumer. Keeps the last good snapshot on request
 * failure so the strip never flickers.
 */
export function StationStatusProvider({ children }: { children: ReactNode }) {
  const { getNowPlaying } = useAdminApi();
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [loading, setLoading] = useState(true);

  // Kept as a .then chain on purpose: matches the data-loading idiom used
  // across the admin panel and satisfies react-hooks/set-state-in-effect.
  const refresh = useCallback(() => {
    getNowPlaying()
      .then((data) => {
        setNowPlaying(data as NowPlayingData);
      })
      .catch(() => {
        // Keep the previous snapshot on failure.
      })
      .finally(() => {
        setLoading(false);
      });
  }, [getNowPlaying]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <StationStatusContext.Provider value={{ nowPlaying, loading, refresh }}>
      {children}
    </StationStatusContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStationStatus(): StationStatusValue {
  const ctx = useContext(StationStatusContext);
  if (!ctx) {
    throw new Error('useStationStatus must be used within StationStatusProvider');
  }
  return ctx;
}
