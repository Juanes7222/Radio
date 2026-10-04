import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { getBogotaDateString, getStationDayStartWithOffset } from "../../shared/utils/date";
import { PLAYBACK_RETENTION_DAYS } from "./playbackHistory";

const DEFAULT_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_LIMIT_PAGES = 500;
const MAX_SEARCH_LENGTH = 200;
const PLAYLIST_CACHE_TTL_MS = 10 * 60_000;

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

/**
 * Días hacia atrás desde hoy en la zona de la estación. Se resuelve contra el
 * día de la estación y no contra las 24 h del servidor, que pueden no coincidir.
 */
function stationDayStartWithOffset(daysOffset: number): Date {
  return getStationDayStartWithOffset(daysOffset);
}

/**
 * Convierte una clave YYYY-MM-DD al instante del inicio de ese día en la zona de
 * la estación. La diferencia de días se calcula entre claves, no entre
 * instantes: comparar contra `Date.now()` obliga a redondear y el redondeo
 * desplaza el día un día entero en la mitad de los casos.
 */
function stationDayStartForKey(dateKey: string): Date {
  const todayKey = getBogotaDateString(0);
  const diffDays = Math.round(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / DAY_MS
  );
  return stationDayStartWithOffset(diffDays);
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
      from: stationDayStartWithOffset(-(DEFAULT_WINDOW_DAYS - 1)),
      to: stationDayStartWithOffset(1),
    };
  }

  const to = rawTo === "" ? stationDayStartWithOffset(1) : stationDayStartForKey(rawTo);
  const from =
    rawFrom === ""
      ? new Date(to.getTime() - (DEFAULT_WINDOW_DAYS - 1) * DAY_MS)
      : stationDayStartForKey(rawFrom);
  const exclusiveTo = new Date(to.getTime() + DAY_MS);

  if (from.getTime() > to.getTime()) {
    throw new AppError(400, "El rango 'from' no puede ser posterior a 'to'");
  }
  if (exclusiveTo.getTime() - from.getTime() > PLAYBACK_RETENTION_DAYS * DAY_MS) {
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

function parseOrder(value: unknown): PlaybackAudioOrder {
  if (value === "recent" || value === "first") return value;
  return "plays";
}

export function parsePlaybackQuery(query: Record<string, unknown>): ParsedPlaybackQuery {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= MAX_LIMIT_PAGES
      ? rawPage
      : 1;
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= MAX_LIMIT
      ? rawLimit
      : DEFAULT_LIMIT;

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

export async function listPlaybackEvents(parsed: ParsedPlaybackQuery) {
  const where = buildWhere(parsed.filters);
  const [rows, total] = await Promise.all([
    prisma.playbackEvent.findMany({
      where,
      orderBy: { playedAt: "desc" },
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

export async function listPlaybackAudios(parsed: ParsedPlaybackQuery, order: PlaybackAudioOrder) {
  const where = buildWhere(parsed.filters);

  const orderBy =
    order === "recent"
      ? { lastPlayedAt: "desc" as const }
      : order === "first"
        ? { firstPlayedAt: "asc" as const }
        : { plays: "desc" as const };

  const grouped = await prisma.playbackEvent.groupBy({
    by: ["songId"],
    where,
    _count: { _all: true },
    _min: { playedAt: true },
    _max: { playedAt: true },
    orderBy:
      order === "recent"
        ? { _max: { playedAt: "desc" } }
        : order === "first"
          ? { _min: { playedAt: "asc" } }
          : { _count: { songId: "desc" } },
    skip: (parsed.page - 1) * parsed.limit,
    take: parsed.limit,
  });

  // Prisma no expone COUNT(DISTINCT), y el SQL crudo queda descartado por
  // decisión de diseño, así que el total de audios distintos se cuenta
  // trayendo solo la clave. Medido: 46 ms a 90 días, 15 ms a 30.
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
  const metadata = songIds.length === 0 ? [] : await prisma.playbackEvent.findMany({
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
      firstPlayedAt: group._min.playedAt,
      lastPlayedAt: group._max.playedAt,
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

  const grouped = await prisma.playbackEvent.groupBy({
    by: ["playlist"],
    where: { playlist: { not: "" } },
    _count: { _all: true },
    orderBy: { playlist: "asc" },
  });
  const values = grouped.map((group) => group.playlist);
  playlistCache = { values, expiresAt: now + PLAYLIST_CACHE_TTL_MS };
  return values;
}