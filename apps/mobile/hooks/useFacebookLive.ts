import { useEffect, useRef, useState } from 'react';
import EventSource from 'react-native-sse';

interface LiveStartPayload {
  status: 'live';
  url: string;
}

export function useFacebookLive() {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  const eventSourceRef = useRef<any>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            const data: LiveStartPayload = JSON.parse(
              event?.data ?? '{}'
            );

            console.log('Facebook Live started:', data.url);

            if (data.url) {
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

  return {
    liveUrl,
    dismiss: () => setLiveUrl(null),
  };
}