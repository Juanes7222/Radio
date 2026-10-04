import { prisma } from "../../infrastructure/database/prisma";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { logger } from "../../shared/logger/logger";
import { AZURACAST_REQUEST_TIMEOUT_MS } from "../../shared/constants";
import type { SongHistory } from "@radio/types";

export const PLAYBACK_RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * Slack allowed between the oldest stored event and the retention floor before
 * a run treats the history as incomplete. Pruning leaves MIN(played_at)
 * resting right on the floor, so without this margin a table with full
 * coverage would look like a gap on every run.
 */
const COVERAGE_MARGIN_MS = DAY_MS;

/**
 * Margin subtracted from the newest known play. The AzuraCast endpoint is
 * queried by time window, so overlapping does not duplicate thanks to the
 * unique index on azuracast_sh_id, and this margin keeps a failed poll from
 * leaving a hole.
 */
const POLL_OVERLAP_MS = 10 * 60_000;

const BACKFILL_CHUNK_MS = DAY_MS;

/** AzuraCast returns unix seconds; Prisma works with Date. */
function toDate(unixSeconds: number): Date {
  return new Date(unixSeconds * 1000);
}

/**
 * Live spots and DJ talk arrive without metadata. A missing value is stored as
 * an empty string instead of undefined, because undefined in a createMany call
 * aborts the whole batch.
 */
function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toRow(record: SongHistory) {
  return {
    azuracastShId: record.sh_id,
    playedAt: toDate(record.played_at),
    durationSec: record.duration,
    songId: record.song.id,
    title: toText(record.song.title),
    artist: toText(record.song.artist),
    album: toText(record.song.album),
    playlist: record.playlist,
    streamer: record.streamer,
    isRequest: record.is_request,
  };
}

/**
 * Drops the keys already stored and persists the rest in a single batch.
 * Prisma 6.19 on SQLite has no skipDuplicates, so deduplication happens before
 * the insert instead of being left to the database. Ids repeated inside the
 * same response are dropped too: AzuraCast can report the same sh_id twice,
 * and letting both through would violate the unique index and abort the run.
 */
async function insertMissing(rows: ReturnType<typeof toRow>[]): Promise<number> {
  if (rows.length === 0) return 0;

  const ids = [...new Set(rows.map((row) => row.azuracastShId))];
  const existing = await prisma.playbackEvent.findMany({
    where: { azuracastShId: { in: ids } },
    select: { azuracastShId: true },
  });
  const known = new Set(existing.map((row) => row.azuracastShId));
  const claimed = new Set<number>();
  const fresh = rows.filter((row) => {
    if (known.has(row.azuracastShId) || claimed.has(row.azuracastShId)) return false;
    claimed.add(row.azuracastShId);
    return true;
  });
  if (fresh.length === 0) return 0;

  await prisma.playbackEvent.createMany({ data: fresh });
  return fresh.length;
}

async function fetchRange(from: Date, to: Date): Promise<SongHistory[]> {
  const { data } = await azuracastApi.get<SongHistory[]>(`/station/${STATION_ID}/history`, {
    params: { start: from.toISOString(), end: to.toISOString() },
    timeout: AZURACAST_REQUEST_TIMEOUT_MS,
  });
  return Array.isArray(data) ? data : [];
}

async function collect(from: Date, to: Date): Promise<number> {
  const records = await fetchRange(from, to);
  if (records.length === 0) return 0;
  return insertMissing(records.map(toRow));
}

/**
 * One run at a time. The manual poll from the Jobs panel can overlap with the
 * cron; without this guard both could try to insert the same sh_id. If a P2002
 * still gets through, the next tick overlaps the same window and heals it.
 */
let running: Promise<void> | null = null;

export async function capturePlaybackHistory(): Promise<void> {
  if (running) {
    logger.info("PlaybackHistory", "Run already in progress, skipping");
    return;
  }
  running = runOnce().finally(() => {
    running = null;
  });
  return running;
}

async function runOnce(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - PLAYBACK_RETENTION_DAYS * DAY_MS);

  try {
    await collectHistory(now, cutoff);
  } catch (error) {
    // Retention has to run even when collection fails, otherwise the table
    // grows without bound exactly when the system is already broken. The prune
    // error is dropped on purpose: the collection error is the one the scheduler
    // has to record.
    await prune(cutoff).catch((pruneError: unknown) => {
      logger.error("PlaybackHistory", "Prune failed after a collection error", {
        error: pruneError instanceof Error ? pruneError.message : String(pruneError),
      });
    });
    throw error;
  }

  await prune(cutoff);
}

async function prune(cutoff: Date): Promise<void> {
  const deleted = await prisma.playbackEvent.deleteMany({ where: { playedAt: { lt: cutoff } } });
  if (deleted.count > 0) {
    logger.info("PlaybackHistory", "Pruned old events", { deleted: deleted.count });
  }
}

/**
 * Coverage is measured from the oldest stored event, not from an empty table:
 * a cold deployment fills its first window and every later run would otherwise
 * poll forward and never look back, leaving the older part of the retention
 * window permanently empty.
 */
async function collectHistory(now: Date, cutoff: Date): Promise<void> {
  const [oldest, newest] = await Promise.all([
    prisma.playbackEvent.findFirst({ orderBy: { playedAt: "asc" }, select: { playedAt: true } }),
    prisma.playbackEvent.findFirst({ orderBy: { playedAt: "desc" }, select: { playedAt: true } }),
  ]);

  const coveredToFloor =
    oldest !== null &&
    newest !== null &&
    oldest.playedAt.getTime() <= cutoff.getTime() + COVERAGE_MARGIN_MS;

  if (!coveredToFloor) {
    // One day is ~480 records (~0.2 MB of JSON); asking for the whole window at
    // once would be ~18 MB in a single response, past the request timeout.
    const inserted = await collectByDay(cutoff, now);
    logger.info("PlaybackHistory", "Backfill run finished", {
      from: cutoff.toISOString(),
      to: now.toISOString(),
      inserted,
    });
    return;
  }

  // Clamped to now because a station clock ahead of the backend would otherwise
  // produce an inverted window and a poll that silently returns nothing.
  const from = new Date(
    Math.min(Math.max(newest.playedAt.getTime() - POLL_OVERLAP_MS, 0), now.getTime()),
  );
  const gapDays = Math.ceil((now.getTime() - from.getTime()) / DAY_MS);
  const inserted = gapDays > 1 ? await collectByDay(from, now) : await collect(from, now);
  logger.info("PlaybackHistory", "Poll finished", { from: from.toISOString(), inserted });
}

/**
 * A long outage leaves a gap too wide for one request, so the window is walked
 * day by day and no single response grows without bound.
 */
async function collectByDay(from: Date, to: Date): Promise<number> {
  let inserted = 0;
  for (let cursor = from.getTime(); cursor < to.getTime(); cursor += BACKFILL_CHUNK_MS) {
    const chunkEnd = Math.min(cursor + BACKFILL_CHUNK_MS, to.getTime());
    inserted += await collect(new Date(cursor), new Date(chunkEnd));
  }
  return inserted;
}
