import { useState, useEffect, useRef } from 'react';

export function useFacebookLive() {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const sseUrl = `${baseUrl}/live-status/stream`;

    const connect = () => {
      try {
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('live_start', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.url) {
              console.log('Facebook Live started:', data.url);
              setLiveUrl(data.url);
            }
          } catch (error) {
            console.error('Error parsing live_start event:', error);
          }
        });

        eventSource.addEventListener('live_end', () => {
          console.log('Facebook Live ended');
          setLiveUrl(null);
        });

        eventSource.onerror = () => {
          console.log('SSE connection error, will retry...');
          eventSource.close();
          // Retry after 5 seconds
          retryRef.current = setTimeout(connect, 5000);
        };

        eventSource.onopen = () => {
          console.log('SSE connection established');
        };
      } catch (error) {
        console.error('Error creating EventSource:', error);
        retryRef.current = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      eventSourceRef.current?.close();
    };
  }, []);

  return { liveUrl, dismiss: () => setLiveUrl(null) };
}