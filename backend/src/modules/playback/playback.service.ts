import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { getStationDayStartWithOffset, getStationTime } from "../../shared/utils/date";
import { PLAYBACK_RETENTION_DAYS } from "./playbackHistory";

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 200;
const PLAYLIST_CACHE_TTL_MS = 10 * 60_000;

/**
 * Length of a day, used only to count whole days between two station day keys,
 * which are read as UTC midnights and are therefore always exact multiples of
 * it. Station day arithmetic goes through `getStationDayStartWithOffset`, which
 * re-normalizes the day so a time zone change cannot shift the window.
 */
const MS_PER_KEY_DAY = 86_400_000;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PlaybackAudioOrder = "plays" | "recent" | "first";

export interface PlaybackRange {
  from: Date;
  to: Date;
}

export interface PlaybackFilters {
  range: PlaybackRange;
  playlist: string | null;
  search: string | null;
  /** Exige `streamer` vacío, es decir solo programación automática y no una transmisión de DJ. */
  automatedOnly: boolean;
}

export interface ParsedPlaybackQuery {
  page: number;
  limit: number;
  filters: PlaybackFilters;
}

export interface PlaybackEventRow {
  shId: number;
  playedAt: Date;
  durationSec: number;
  songId: string;
  title: string;
  artist: string;
  album: string;
  playlist: string;
  streamer: string;
  isRequest: boolean;
}

export interface PlaybackAudioRow {
  songId: string;
  title: string;
  artist: string;
  album: string;
  plays: number;
  firstPlayedAt: Date;
  lastPlayedAt: Date;
}

/** Whole days between two station day keys, counted between UTC midnights. */
function dayDiffBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / MS_PER_KEY_DAY
  );
}

/**
 * Convierte una clave YYYY-MM-DD al instante del inicio de ese día en la zona de
 * la estación. La diferencia de días se calcula entre claves, no entre
 * instantes: comparar contra `Date.now()` obliga a redondear y el redondeo
* desplaza el día un día entero en la mitad de los casos. La clave de hoy es la
 * de la estación y no una fija en Bogotá, para que el offset con el que se
 * resuelve y el día de referencia nunca midan contra zonas distintas.
 */
function stationDayStartForKey(dateKey: string): Date {
  return getStationDayStartWithOffset(-dayDiffBetweenKeys(dateKey, getStationTime().dayKey));
}

/**
 * Valida el rango. El tope coincide con la retención: permitir ventanas más
 * anchas solo daría consultas más lentas sobre datos que ya no existen.
 *
 * `to` es exclusivo: el último día del rango se cubre entero porque el límite
 * superior es el inicio del día siguiente.
 */
function parseRange(query: Record<string, unknown>): PlaybackRange {
  const rawFrom = typeof query.from === "string" ? query.from.trim() : "";
  const rawTo = typeof query.to === "string" ? query.to.trim() : "";

  if (rawFrom !== "" && !DATE_KEY_PATTERN.test(rawFrom)) {
    throw new AppError(400, "Fecha 'from' inválida, se espera YYYY-MM-DD");
  }
  if (rawTo !== "" && !DATE_KEY_PATTERN.test(rawTo)) {
    throw new AppError(400, "Fecha 'to' inválida, se espera YYYY-MM-DD");
  }
  if (rawFrom !== "" && Number.isNaN(Date.parse(`${rawFrom}T00:00:00Z`))) {
    throw new AppError(400, "Fecha 'from' inválida, se espera YYYY-MM-DD");
  }
  if (rawTo !== "" && Number.isNaN(Date.parse(`${rawTo}T00:00:00Z`))) {
    throw new AppError(400, "Fecha 'to' inválida, se espera YYYY-MM-DD");
  }

  if (rawFrom === "" && rawTo === "") {
    return {
      from: getStationDayStartWithOffset(-(DEFAULT_WINDOW_DAYS - 1)),
      to: getStationDayStartWithOffset(1),
    };
  }

  const to = rawTo === "" ? getStationDayStartWithOffset(1) : stationDayStartForKey(rawTo);
  const from =
    rawFrom === ""
      ? getStationDayStartWithOffset(-(DEFAULT_WINDOW_DAYS - 1), to)
      : stationDayStartForKey(rawFrom);
  const exclusiveTo = getStationDayStartWithOffset(1, to);

  if (from.getTime() > to.getTime()) {
    throw new AppError(400, "El rango 'from' no puede ser posterior a 'to'");
  }

  // The window is measured in station days, not in milliseconds: 55 station days
  // span 55 days plus or minus an hour across a time zone change, and the cap
  // must count days, otherwise the edge of the retention window becomes
  // unreachable on half of the calendar. `exclusiveTo` already is the start of
  // the first day outside the window, so the day difference up to it is the count
  // of covered days with no correction: a window from D to D+54 covers 55 days.
  const rangeDays = dayDiffBetweenKeys(
    getStationTime(from).dayKey,
    getStationTime(exclusiveTo).dayKey
  );
  if (rangeDays > PLAYBACK_RETENTION_DAYS) {
    throw new AppError(400, `El rango no puede superar ${PLAYBACK_RETENTION_DAYS} días`);
  }

  return { from, to: exclusiveTo };
}

function parseSearch(query: Record<string, unknown>): string | null {
  if (typeof query.search !== "string") return null;
  const value = query.search.trim();
  if (value === "") return null;
  if (value.length > MAX_SEARCH_LENGTH) {
    throw new AppError(400, `La búsqueda admite hasta ${MAX_SEARCH_LENGTH} caracteres`);
  }
  return value;
}

/**
 * Normalizes the audio aggregate order. It lives in the service so the route
 * does not have to reimplement the default.
 */
export function parseOrder(value: unknown): PlaybackAudioOrder {
  if (value === "recent" || value === "first") return value;
  return "plays";
}

export function parsePlaybackQuery(query: Record<string, unknown>): ParsedPlaybackQuery {
  const rawPage = Number(query.page);
  // There is no cap on the page number: an out of range page answers with an
  // empty `rows` instead of silently rewriting the page the caller asked for,
  // and deep offsets are cheap because the played_at index resolves them.
  // `isSafeInteger` instead of `isInteger` keeps the trust boundary closed
  // without reintroducing a business cap: a page beyond 2^53 makes `skip`
  // overflow, Prisma sends it to the engine as null and the query fails with an
  // unhandled 500. Such a value is malformed input, like 0 or "abc", so it is
  // normalized to the first page like any other.
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  // A valid limit is clipped to the maximum; anything that is not a positive
  // integer falls back to the default.
  const rawLimit = Number(query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  return {
    page,
    limit,
    filters: {
      range: parseRange(query),
      playlist:
        typeof query.playlist === "string" && query.playlist.trim() !== ""
          ? query.playlist.trim()
          : null,
      search: parseSearch(query),
      automatedOnly: query.automated === "1",
    },
  };
}

/** `contains` en SQLite es LIKE, insensible a mayúsculas para ASCII. */
function buildWhere(filters: PlaybackFilters): Prisma.PlaybackEventWhereInput {
  const where: Prisma.PlaybackEventWhereInput = {
    playedAt: { gte: filters.range.from, lt: filters.range.to },
  };
  if (filters.playlist) {
    where.playlist = filters.playlist;
  }
  if (filters.automatedOnly) {
    where.streamer = "";
  }
  if (filters.search) {
    where.OR = [{ title: { contains: filters.search } }, { artist: { contains: filters.search } }];
  }
  return where;
}

export interface PlaybackPage<TRow> {
  rows: TRow[];
  total: number;
  page: number;
  totalPages: number;
}

export async function listPlaybackEvents(
  parsed: ParsedPlaybackQuery
): Promise<PlaybackPage<PlaybackEventRow>> {
  const where = buildWhere(parsed.filters);
  const [rows, total] = await Promise.all([
    prisma.playbackEvent.findMany({
      where,
      // Ties are broken by sh_id because two events can share playedAt down to
      // the millisecond, and without a second key the same row could appear on
      // two pages or on none.
      orderBy: [{ playedAt: "desc" }, { azuracastShId: "desc" }],
      take: parsed.limit,
      skip: (parsed.page - 1) * parsed.limit,
    }),
    prisma.playbackEvent.count({ where }),
  ]);

  return {
    rows: rows.map((row) => ({
      shId: row.azuracastShId,
      playedAt: row.playedAt,
      durationSec: row.durationSec,
      songId: row.songId,
      title: row.title,
      artist: row.artist,
      album: row.album,
      playlist: row.playlist,
      streamer: row.streamer,
      isRequest: row.isRequest,
    })),
    total,
    page: parsed.page,
    totalPages: Math.max(1, Math.ceil(total / parsed.limit)),
  };
}

export async function listPlaybackAudios(
  parsed: ParsedPlaybackQuery,
  order: PlaybackAudioOrder
): Promise<PlaybackPage<PlaybackAudioRow>> {
  const where = buildWhere(parsed.filters);

// songId breaks every tie. Tied plays are the common case, not the exception:
  // an audio played once in the window ties with every other audio played once,
  // and without a second key the pagination would repeat and drop rows.
  // `satisfies` rather than a type annotation: the generated type for groupBy is
  // `orderBy?: X | X[]`, but a type annotation widens this to the whole model and
  // Prisma requires every field named in orderBy to be listed in `by`, so the wide
  // type does not compile. `satisfies` keeps the narrow shape and still checks it.
  // The array form is not a Prisma requirement: the object form is inside the
  // contract too (devices/admin.routes.ts:395 uses it), but these two criteria
  // cannot share one object.
  const orderBy = (order === "recent"
    ? [{ _max: { playedAt: "desc" } }, { songId: "asc" }]
    : order === "first"
      ? [{ _min: { playedAt: "asc" } }, { songId: "asc" }]
      : [{ _count: { songId: "desc" } }, { songId: "asc" }]) satisfies
    Prisma.PlaybackEventOrderByWithAggregationInput[];

  const grouped = await prisma.playbackEvent.groupBy({
    by: ["songId"],
    where,
    _count: { _all: true },
    _min: { playedAt: true },
    _max: { playedAt: true },
    orderBy,
    skip: (parsed.page - 1) * parsed.limit,
    take: parsed.limit,
  });

  // Prisma no expone COUNT(DISTINCT), y el SQL crudo queda descartado por
  // decisión de diseño, así que el total de audios distintos se cuenta
  // trayendo solo la clave. Medido: 103-108 ms con 34 000 filas en la ventana.
  const distinctSongIds = await prisma.playbackEvent.findMany({
    where,
    distinct: ["songId"],
    select: { songId: true },
  });
  const total = distinctSongIds.length;

  const songIds = grouped.map((group) => group.songId);
  // La metadata se resuelve aparte y se toma del play más reciente de cada
  // audio: agrupar por songId + title partiría el contador de un audio en
  // varios grupos si su metadata se editó dentro de la ventana.
  const metadata =
    songIds.length === 0
      ? []
      : await prisma.playbackEvent.findMany({
          where: { songId: { in: songIds } },
          distinct: ["songId"],
          orderBy: { playedAt: "desc" },
          select: { songId: true, title: true, artist: true, album: true },
        });
  const metaBySongId = new Map(metadata.map((row) => [row.songId, row]));

  return {
    rows: grouped.map((group) => ({
      songId: group.songId,
      title: metaBySongId.get(group.songId)?.title ?? "",
      artist: metaBySongId.get(group.songId)?.artist ?? "",
      album: metaBySongId.get(group.songId)?.album ?? "",
      plays: group._count._all,
      // `_min` and `_max` are typed as nullable because Prisma does not know
      // that playedAt is NOT NULL in the model. The null is impossible by
      // schema: a group only exists when it has at least one row.
      firstPlayedAt: group._min.playedAt as Date,
      lastPlayedAt: group._max.playedAt as Date,
    })),
    total,
    page: parsed.page,
    totalPages: Math.max(1, Math.ceil(total / parsed.limit)),
  };
}

let playlistCache: { values: string[]; expiresAt: number } | null = null;

/**
 * La lista de playlists cuesta 17-29 ms si se recalcula en cada petición, y
 * solo sirve para llenar un desplegable. Las rotaciones se configuran a las
 * 03:30, así que diez minutos de caché es suficiente.
 */
export async function listPlaybackPlaylists(): Promise<string[]> {
  const now = Date.now();
  if (playlistCache && playlistCache.expiresAt > now) {
    return playlistCache.values;
  }

  // No aggregation here: this groups the whole table and only the names are
  // returned, so a `_count` would be computed over every row and discarded.
  const grouped = await prisma.playbackEvent.groupBy({
    by: ["playlist"],
    where: { playlist: { not: "" } },
    orderBy: { playlist: "asc" },
  });
  const values = grouped.map((group) => group.playlist);
  playlistCache = { values, expiresAt: now + PLAYLIST_CACHE_TTL_MS };
  return values;
}
