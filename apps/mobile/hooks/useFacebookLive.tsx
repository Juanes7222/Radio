import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';

type LiveEventName = 'live_start' | 'live_end';

interface LiveStartPayload {
  status: 'live';
  url: string;
}

interface FacebookLiveContextType {
  liveUrl: string | null;
  dismiss: () => void;
}

const FacebookLiveContext = createContext<FacebookLiveContextType>({
  liveUrl: null,
  dismiss: () => {},
});

// Exponential backoff so flaky networks do not hammer the server.
const RETRY_DELAYS = [5000, 10000, 20000, 40000, 60000];

export function FacebookLiveProvider({ children }: { children: React.ReactNode }) {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl =
      process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    const sseUrl = `${baseUrl}/live-status/stream`;

    let disposed = false;
    let eventSource: EventSource<LiveEventName> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let isActive = AppState.currentState === 'active';

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || !isActive || retryTimer) return;
      const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)];
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    const closeSource = () => {
      eventSource?.close();
      eventSource = null;
    };

    const connect = () => {
      if (disposed || !isActive) return;
      closeSource();

      try {
        const es = new EventSource<LiveEventName>(sseUrl);
        eventSource = es;

        es.addEventListener('open', () => {
          retryAttempt = 0;
        });

        es.addEventListener('error', () => {
          es.close();
          if (eventSource === es) eventSource = null;
          scheduleReconnect();
        });

        es.addEventListener('live_start', (event) => {
          try {
            const data: LiveStartPayload = JSON.parse(event?.data ?? '{}');
            if (data.url) {
              setLiveUrl(data.url);
            }
          } catch (error) {
            console.error('Error parsing live_start event:', error);
          }
        });

        es.addEventListener('live_end', () => {
          setLiveUrl(null);
        });
      } catch (error) {
        console.error('Error creating EventSource:', error);
        scheduleReconnect();
      }
    };

    connect();

    // Close the connection when the app goes to background and reopen it on
    // foreground, so an idle open socket does not drain battery or data.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      isActive = state === 'active';
      if (isActive) {
        clearRetry();
        retryAttempt = 0;
        if (!eventSource) {
          connect();
        }
      } else {
        clearRetry();
        closeSource();
      }
    });

    return () => {
      disposed = true;
      appStateSubscription.remove();
      clearRetry();
      closeSource();
    };
  }, []);

  const contextValue = {
    liveUrl,
    dismiss: () => setLiveUrl(null),
  };

  return (
    <FacebookLiveContext.Provider value={contextValue}>
      {children}
    </FacebookLiveContext.Provider>
  );
}

export function useFacebookLive() {
  return useContext(FacebookLiveContext);
}
