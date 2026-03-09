import { useState, useEffect } from 'react';

export function useFacebookLive() {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_API_BASE_URL
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'facebook_live') setLiveUrl(data.url);
    };

    ws.onerror = () => ws.close();

    return () => ws.close();
  }, []);

  return { liveUrl, dismiss: () => setLiveUrl(null) };
}