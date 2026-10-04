import { prisma } from "../../infrastructure/database/prisma";
import { azuracastApi, STATION_ID } from "../azuracast/azuracast.client";
import { logger } from "../../shared/logger/logger";
import { AZURACAST_REQUEST_TIMEOUT_MS } from "../../shared/constants";
import type { SongHistory } from "@radio/types";

export const PLAYBACK_RETENTION_DAYS = 90;

/** Días de historial que recupera una sola corrida cuando la tabla está vacía. */
const BACKFILL_DAYS_PER_RUN = 30;

/**
 * Margen que se resta al último play conocido. El endpoint de AzuraCast se
 * consulta por ventana de tiempo, así que solapar no duplica gracias al
 * índice único sobre azuracast_sh_id, y este margen garantiza que un poll
 * fallido no deje un hueco.
 */
const POLL_OVERLAP_MS = 10 * 60_000;

const DAY_MS = 86_400_000;
const BACKFILL_CHUNK_MS = DAY_MS;

/** AzuraCast devuelve unix en segundos; Prisma trabaja con Date. */
function toDate(unixSeconds: number): Date {
  return new Date(unixSeconds * 1000);
}

/**
 * Locuciones y DJ en vivo llegan sin metadatos. Un valor ausente se guarda
 * como cadena vacía en vez de undefined, porque undefined en un lote de
 * createMany aborta el lote completo.
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
 * Descarta las claves ya guardadas y persiste el resto en un solo lote.
 * Prisma 6.19 sobre SQLite no ofrece skipDuplicates, así que la deduplicación
 * se hace antes del insert en lugar de dejarla en la base.
 */
async function insertMissing(rows: ReturnType<typeof toRow>[]): Promise<number> {
  if (rows.length === 0) return 0;

  const ids = [...new Set(rows.map((row) => row.azuracastShId))];
  const existing = await prisma.playbackEvent.findMany({
    where: { azuracastShId: { in: ids } },
    select: { azuracastShId: true },
  });
  const known = new Set(existing.map((row) => row.azuracastShId));
  const fresh = rows.filter((row) => !known.has(row.azuracastShId));
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
 * Una sola corrida a la vez. El poll manual desde el panel de Jobs puede
 * solaparse con el cron; sin este guard ambos podrían intentar insertar el
 * mismo sh_id. Si aun así llegara un P2002, la ventana solapada del
 * siguiente tick lo resuelve.
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
  let inserted = 0;

  const newest = await prisma.playbackEvent.findFirst({
    orderBy: { playedAt: "desc" },
    select: { playedAt: true },
  });

  if (!newest) {
    // Tabla vacía: no hay de dónde retomar, así que se recupera el histórico
    // por días. Un día son ~480 registros (~0,2 MB de JSON); pedir los 30 de
    // una vez serían ~8 MB en una sola respuesta, por encima del timeout.
    const start = new Date(now.getTime() - BACKFILL_DAYS_PER_RUN * DAY_MS);
    inserted = await collectByDay(start, now);
    logger.info("PlaybackHistory", "Backfill run finished", { days: BACKFILL_DAYS_PER_RUN, inserted });
  } else {
    const from = new Date(Math.max(newest.playedAt.getTime() - POLL_OVERLAP_MS, 0));
    const gapDays = Math.ceil((now.getTime() - from.getTime()) / DAY_MS);
    inserted =
      gapDays > 1 ? await collectByDay(from, now) : await collect(from, now);
    logger.info("PlaybackHistory", "Poll finished", { from: from.toISOString(), inserted });
  }

  const cutoff = new Date(now.getTime() - PLAYBACK_RETENTION_DAYS * DAY_MS);
  const deleted = await prisma.playbackEvent.deleteMany({ where: { playedAt: { lt: cutoff } } });
  if (deleted.count > 0) {
    logger.info("PlaybackHistory", "Pruned old events", { deleted: deleted.count });
  }
}

/**
 * Una caída larga deja un hueco que cabe en una sola ventana. Se pide día por
 * día para que ninguna respuesta crezca sin límite.
 */
async function collectByDay(from: Date, to: Date): Promise<number> {
  let inserted = 0;
  for (let cursor = from.getTime(); cursor < to.getTime(); cursor += BACKFILL_CHUNK_MS) {
    const chunkEnd = Math.min(cursor + BACKFILL_CHUNK_MS, to.getTime());
    inserted += await collect(new Date(cursor), new Date(chunkEnd));
  }
  return inserted;
}
