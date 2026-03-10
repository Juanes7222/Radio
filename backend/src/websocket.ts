import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

const clients = new Set<WebSocket>();

export function initWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });
}

export function notifyFrontend(permalinkUrl: string | null) {
  const payload = JSON.stringify({ type: 'facebook_live', url: permalinkUrl });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}