import { Response } from 'express';
import { readFileSync, writeFileSync } from 'fs';

const STATE_FILE = '/var/www/radio/live-state.json';
const clients = new Set<Response>();

interface LiveState {
  liveUrl: string | null;
}

function loadState(): string | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8')).liveUrl ?? null;
  } catch {
    return null;
  }
}

function saveState(url: string | null) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ liveUrl: url }), 'utf-8');
  } catch (error) {
    console.error('Error saving live state:', error);
  }
}

let currentLiveUrl: string | null = loadState();

export function addSSEClient(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  clients.add(res);

  if (currentLiveUrl !== null) {
    const data = JSON.stringify({ status: 'live', url: currentLiveUrl });
    res.write(`event: live_start\ndata: ${data}\n\n`);
  } else {
    const data = JSON.stringify({ status: 'idle' });
    res.write(`event: live_end\ndata: ${data}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 30000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

export function notifyLiveStart(permalinkUrl: string) {
  currentLiveUrl = permalinkUrl;
  saveState(permalinkUrl);

  const data = JSON.stringify({ status: 'live', url: permalinkUrl });
  const message = `event: live_start\ndata: ${data}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch (error) {
      console.error('Error sending SSE to client:', error);
      clients.delete(client);
    }
  }
}

export function notifyLiveEnd() {
  currentLiveUrl = null;
  saveState(null);

  const data = JSON.stringify({ status: 'idle' });
  const message = `event: live_end\ndata: ${data}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch (error) {
      console.error('Error sending SSE to client:', error);
      clients.delete(client);
    }
  }
}

export function getCurrentLiveUrl(): string | null {
  return currentLiveUrl;
}
