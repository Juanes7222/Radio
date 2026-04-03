import { useState, useEffect, useRef } from 'react';

const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

export function useFacebookLive() {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    const wsUrl = process.env.EXPO_PUBLIC_BACKEND_URL!
      .replace('https://', 'wss://')
      .replace('http://', 'ws://') + '/ws';

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount.current = 0;
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'facebook_live') setLiveUrl(data.url);
      };

      ws.onclose = () => {
        const delay = RECONNECT_DELAYS[Math.min(retryCount.current, RECONNECT_DELAYS.length - 1)];
        retryCount.current += 1;
        retryRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { liveUrl };
}