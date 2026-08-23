import type { Request, Response } from "express";
import { randomUUID } from "crypto";

const clients = new Set<Response>();
const tickets = new Map<string, number>();

const TICKET_TTL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

let heartbeat: ReturnType<typeof setInterval> | null = null;

function ensureHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const client of clients) {
      client.write(":heartbeat\n\n");
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function pruneExpiredTickets(): void {
  const now = Date.now();
  for (const [ticket, expiresAt] of tickets) {
    if (expiresAt <= now) tickets.delete(ticket);
  }
}

export function issueStreamTicket(): { ticket: string; expiresInMs: number } {
  pruneExpiredTickets();
  const ticket = randomUUID();
  tickets.set(ticket, Date.now() + TICKET_TTL_MS);
  return { ticket, expiresInMs: TICKET_TTL_MS };
}

export function consumeStreamTicket(ticket: string | null): boolean {
  if (!ticket) return false;
  const expiresAt = tickets.get(ticket);
  if (!expiresAt || expiresAt <= Date.now()) return false;
  tickets.delete(ticket);
  return true;
}

export function openPrayerStream(req: Request, res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");

  clients.add(res);
  ensureHeartbeat();

  req.on("close", () => {
    clients.delete(res);
  });
}

export function broadcastPrayerCreated(payload: { id: string; name: string }): void {
  for (const client of clients) {
    client.write(`event: prayer_created\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}
