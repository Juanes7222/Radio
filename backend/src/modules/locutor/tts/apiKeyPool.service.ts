/**
 * Pool of API keys for a metered external provider.
 *
 * The station runs a handful of ElevenLabs accounts so the announcement does
 * not stop when one of them runs out of credits. That makes three questions
 * unavoidable, and collapsing them into a single "is this key usable" boolean
 * gets all three wrong:
 *
 * - Quota exhausted (`quota_exceeded`, reported as a 400): the key is fine, the
 *   month is not. It comes back on the reset date the provider reports.
 * - Invalid key (401 `invalid_api_key`): it will never work again until the
 *   process restarts, so probing it on every synthesis just burns latency.
 * - Concurrency or network failure (429 `too_many_concurrent_requests`, 5xx,
 *   timeout): says nothing about the key at all. Parking it for minutes is
 *   right; parking it until the end of the month is not.
 *
 * State is in memory and per process. A restart re-probes every key once,
 * which is the correct trade for a station that announces a few times a day:
 * the alternative is a table that outlives the problem.
 */

import { logger } from "../../../shared/logger/logger";

export type ApiKeyBlockReason = "quota" | "invalid" | "transient";

interface ApiKeyEntry {
  index: number;
  key: string;
  /** True when the provider rejected the key itself; it never recovers. */
  invalid: boolean;
  /** Epoch ms until which the key is parked. `null` means it is not parked. */
  blockedUntil: number | null;
  blockReason: ApiKeyBlockReason | null;
  inFlight: number;
  lastUsedAt: number | null;
  lastError: string | null;
}

export interface ApiKeySnapshot {
  index: number;
  /** Last four characters, enough to tell two keys apart in the panel. */
  hint: string;
  available: boolean;
  blockReason: ApiKeyBlockReason | null;
  blockedUntil: string | null;
  inFlight: number;
  lastUsedAt: string | null;
  lastError: string | null;
}

function maskKey(key: string): string {
  return key.length <= 4 ? "****" : `****${key.slice(-4)}`;
}

export class ApiKeyPool {
  private readonly entries: ApiKeyEntry[];

  /**
   * Round-robin cursor. Rotating instead of always taking the first free key
   * spreads the monthly credits evenly, so no account is drained while
   * another still has room and every key gets exercised often enough for a
   * revoked one to be noticed before it is needed.
   */
  private cursor = 0;

  constructor(keys: string[]) {
    const unique = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];

    this.entries = unique.map((key, index) => ({
      index,
      key,
      invalid: false,
      blockedUntil: null,
      blockReason: null,
      inFlight: 0,
      lastUsedAt: null,
      lastError: null,
    }));

    if (unique.length !== keys.length) {
      logger.warn("ApiKeyPool", "Duplicate API keys removed from the pool", {
        configured: keys.length,
        unique: unique.length,
      });
    }
  }

  get size(): number {
    return this.entries.length;
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  availableCount(): number {
    return this.freeEntries().length;
  }

  /**
   * Reserves the next usable key and returns a lease. The caller must call
   * `release()` in a `finally`; the in-flight counter is what keeps two
   * concurrent generations from picking the same key when it is the last one
   * with credits.
   *
   * The scan runs over the whole list rather than over the filtered one, so a
   * key that just got parked does not shift the rotation and silently skip the
   * key that comes right after it.
   */
  reserve(): ApiKeyLease | null {
    const now = Date.now();
    if (this.entries.length === 0) return null;

    const start = this.cursor;

    for (let step = 0; step < this.entries.length; step += 1) {
      const entry = this.entries[(start + step) % this.entries.length];
      if (this.isFree(entry, now) && entry.inFlight === 0) {
        this.cursor = (start + step + 1) % this.entries.length;
        entry.inFlight += 1;
        return new ApiKeyLease(entry);
      }
    }

    // Every free key is busy right now. Rather than fail, queue behind the one
    // with the least work in flight.
    let leastBusy: ApiKeyEntry | null = null;
    for (let step = 0; step < this.entries.length; step += 1) {
      const entry = this.entries[(start + step) % this.entries.length];
      if (!this.isFree(entry, now)) continue;
      if (!leastBusy || entry.inFlight < leastBusy.inFlight) leastBusy = entry;
    }

    if (!leastBusy) return null;

    leastBusy.inFlight += 1;
    return new ApiKeyLease(leastBusy);
  }

  snapshot(): ApiKeySnapshot[] {
    const now = Date.now();

    return this.entries.map((entry) => ({
      index: entry.index,
      hint: maskKey(entry.key),
      available: this.isFree(entry, now),
      blockReason: entry.blockReason,
      blockedUntil:
        entry.blockedUntil === null ? null : new Date(entry.blockedUntil).toISOString(),
      inFlight: entry.inFlight,
      lastUsedAt: entry.lastUsedAt === null ? null : new Date(entry.lastUsedAt).toISOString(),
      lastError: entry.lastError,
    }));
  }

  private freeEntries(now = Date.now()): ApiKeyEntry[] {
    return this.entries.filter((entry) => this.isFree(entry, now));
  }

  private isFree(entry: ApiKeyEntry, now: number): boolean {
    return !entry.invalid && (entry.blockedUntil === null || entry.blockedUntil <= now);
  }
}

/**
 * A reserved key. State changes go through the lease so the pool entry and
 * the caller stay in sync, and so the reason is always recorded alongside the
 * timestamp that unblocks it.
 */
export class ApiKeyLease {
  private released = false;

  constructor(private readonly entry: ApiKeyEntry) {}

  get key(): string {
    return this.entry.key;
  }

  get index(): number {
    return this.entry.index;
  }

  get hint(): string {
    return maskKey(this.entry.key);
  }

  succeed(): void {
    this.entry.lastUsedAt = Date.now();
    this.entry.lastError = null;
    this.entry.blockedUntil = null;
    this.entry.blockReason = null;
  }

  block(reason: ApiKeyBlockReason, error: string, until: Date | null): void {
    this.entry.lastError = error;
    this.entry.blockReason = reason;

    if (reason === "invalid") {
      // No timestamp: the key is parked for the lifetime of the process, and
      // reporting a fake reset date in the panel would be a lie.
      this.entry.invalid = true;
      this.entry.blockedUntil = null;
      return;
    }

    this.entry.blockedUntil = until ? until.getTime() : Date.now() + 5 * 60_000;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.entry.inFlight = Math.max(0, this.entry.inFlight - 1);
  }
}
