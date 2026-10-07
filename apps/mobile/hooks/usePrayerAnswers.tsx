import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { BACKEND_URL } from '@/constants/api';
import { getDeviceId } from '@/lib/device';

/**
 * An answer only changes when the team writes it, and the listener has no other
 * signal that does not depend on a push token already being registered. Sixty
 * seconds is the ceiling on how stale the badge can get, and the poll only runs
 * while the app is in the foreground.
 */
const POLL_INTERVAL_MS = 60_000;

interface PrayerAnswersContextValue {
  /** Answers this device has not opened yet. Zero when none, or when unknown. */
  unreadAnswerCount: number;
  /** Called once the listener opens an answer, so the badge drops immediately. */
  acknowledgeAnswer: () => void;
}

const PrayerAnswersContext = createContext<PrayerAnswersContextValue>({
  unreadAnswerCount: 0,
  acknowledgeAnswer: () => {},
});

function readUnreadCount(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) return 0;
  const raw = (payload as { unreadAnswerCount?: unknown }).unreadAnswerCount;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

/**
 * Owns the single "how many answers are waiting for me" count for the whole app.
 * The tab bar and the prayer screens live in different trees, and both need the
 * same number to stay in agreement, so the fetch loop lives here instead of
 * being duplicated per screen.
 */
export function PrayerAnswersProvider({ children }: { children: React.ReactNode }) {
  const [unreadAnswerCount, setUnreadAnswerCount] = useState(0);

  useEffect(() => {
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const deviceId = await getDeviceId();
        const response = await fetch(
          `${BACKEND_URL}/api/prayer/my/${encodeURIComponent(deviceId)}`,
          { headers: { 'x-device-id': deviceId } }
        );
        if (!response.ok || disposed) return;
        // Only a successful read replaces the count. A failed poll keeps the last
        // known value on purpose: dropping the badge on a flaky connection would
        // read as "nothing new" and hide an answer that really is waiting.
        setUnreadAnswerCount(readUnreadCount(await response.json()));
      } catch {
        // Keep the previous value; the next poll retries.
      }
    };

    const stopPolling = () => {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    };

    const startPolling = () => {
      if (pollTimer) return;
      void load();
      pollTimer = setInterval(() => {
        void load();
      }, POLL_INTERVAL_MS);
    };

    if (AppState.currentState === 'active') startPolling();

    // Foreground refreshes at once instead of waiting out the remaining interval.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') startPolling();
      else stopPolling();
    });

    return () => {
      disposed = true;
      subscription.remove();
      stopPolling();
    };
  }, []);

  // Local decrement, not a refetch: the answer is already known to be open, so
  // waiting out the poll would leave a stale badge on screen. If this ever drifts
  // from the server, the next poll or foreground corrects it.
  const acknowledgeAnswer = useCallback(() => {
    setUnreadAnswerCount((previous) => Math.max(0, previous - 1));
  }, []);

  const value = useMemo(
    () => ({ unreadAnswerCount, acknowledgeAnswer }),
    [unreadAnswerCount, acknowledgeAnswer]
  );

  return (
    <PrayerAnswersContext.Provider value={value}>
      {children}
    </PrayerAnswersContext.Provider>
  );
}

export function usePrayerAnswers(): PrayerAnswersContextValue {
  return useContext(PrayerAnswersContext);
}
