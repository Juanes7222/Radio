import { useState, useEffect, useRef } from 'react';

export function useFacebookLive() {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_API_BASE_URL
      .replace('https://', 'wss://')
      .replace('http://', 'ws://') + '/ws';

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'facebook_live') setLiveUrl(data.url);
      };

      ws.onclose = () => {
        retryRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { liveUrl, dismiss: () => setLiveUrl(null) };
}