import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import * as Notifications from 'expo-notifications';

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

export function FacebookLiveProvider({ children }: { children: React.ReactNode }) {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  const eventSourceRef = useRef<any>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNotifiedLiveRef = useRef<string | null>(null);

  useEffect(() => {
    const baseUrl =
      process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    const sseUrl = `${baseUrl}/live-status/stream`;

    const connect = () => {
      try {
        const es: any = new EventSource(sseUrl);

        eventSourceRef.current = es;

        es.addEventListener('open', () => {
          console.log('SSE connection established');
        });

        es.addEventListener('error', () => {
          console.log('SSE connection error, retrying...');
          es.close();
          retryRef.current = setTimeout(connect, 5000);
        });

        es.addEventListener('live_start', (event: any) => {
          try {
            const data: LiveStartPayload = JSON.parse(event?.data ?? '{}');
            if (data.url) {
              console.log('Facebook Live started:', data.url);
              if (lastNotifiedLiveRef.current !== data.url) {
                lastNotifiedLiveRef.current = data.url;
                Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'En vivo ahora',
                    body: 'La emisora está en transmisión en vivo',
                    sound: true,
                    data: { isLiveNotify: true, url: data.url },
                  },
                  trigger: null,
                }).catch(() => {});
              }
              setLiveUrl(data.url);
            }
          } catch (error) {
            console.error('Error parsing live_start event:', error);
          }
        });

        es.addEventListener('live_end', () => {
          console.log('Facebook Live ended');
          setLiveUrl(null);
        });
      } catch (error) {
        console.error('Error creating EventSource:', error);
        retryRef.current = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (retryRef.current) {
        clearTimeout(retryRef.current);
      }
      eventSourceRef.current?.close();
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
