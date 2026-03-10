import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, writeFileSync } from 'fs';
import type { Server } from 'http';

const STATE_FILE = '/var/www/radio/live-state.json';
const clients = new Set<WebSocket>();

function loadState(): string | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8')).liveUrl ?? null;
  } catch {
    return null;
  }
}

function saveState(url: string | null) {
  writeFileSync(STATE_FILE, JSON.stringify({ liveUrl: url }), 'utf-8');
}

let currentLiveUrl: string | null = loadState();

export function initWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);

    if (currentLiveUrl !== null) {
      ws.send(JSON.stringify({ type: 'facebook_live', url: currentLiveUrl }));
    }

    ws.on('close', () => clients.delete(ws));
  });
}

export function notifyFrontend(permalinkUrl: string | null) {
  currentLiveUrl = permalinkUrl;
  saveState(permalinkUrl);
  const payload = JSON.stringify({ type: 'facebook_live', url: permalinkUrl });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}