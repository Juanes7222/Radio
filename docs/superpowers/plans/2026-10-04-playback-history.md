# Playback History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sección del panel admin que muestre qué audio sonó, a qué hora y qué día, y cuántas veces se reprodució cada audio en un período, con filtros de fecha, playlist, texto y peticiones.

**Architecture:** Un job cron consulta `GET /station/{id}/history` de AzuraCast y persiste cada reproducción en una tabla `playback_events` con la metadata del audio copiada a la fila. La página admin lee esa tabla con dos endpoints paginados: un log cronológico y una vista agregada por audio. La metadata se desnormaliza para que el historial nunca toque la biblioteca de 15 000 archivos de AzuraCast.

**Tech Stack:** Express + Prisma 6.19.3 + SQLite, React + Vite + Tailwind, `node-cron`, `@radio/types`.

**Spec:** `docs/superpowers/specs/2026-10-04-playback-history-design.md`

## Global Constraints

- **No hay suite de tests en el backend y no se crea una.** `AGENTS.md` lo prohíbe explícitamente y `backend/package.json` no tiene script `test`. La verificación de cada task es typecheck + lint + build + prueba contra la estación real. `apps/web` sí tiene vitest pero solo para aserciones de build/import-boundaries (`apps/web/tests/perf/`), que no aplica a una página de datos.
- **Comandos de verificación, todos verificados como funcionan hoy:**
  - Typecheck backend: `pnpm --filter radio-admin-backend exec tsc --noEmit`
  - Build backend (genera Prisma + swagger + compila): `pnpm --filter radio-admin-backend build`
  - Lint frontend: `pnpm --filter @radio/web lint`
  - Build frontend: `pnpm --filter @radio/web build`
  - Tests frontend: `pnpm --filter @radio/web test`
- **Retención fija de 90 días, ventana por defecto 30 días, tope duro 90 días.** Una ventana más ancha se rechaza con 400, no se degrada.
- **`limit` 20 por defecto, 50 máximo**, igual que `prayer.routes.ts:33-37`.
- **Contrato de respuesta `{ rows, total, page, totalPages }`**, el de la casa (`prayer.routes.ts:195-202`).
- **Permiso `dashboard`**, reutilizado. No se toca `AdminPermission` ni las tres listas de `packages/types/src/admin.ts`.
- **`skipDuplicates` no existe** en Prisma 6.19.3 sobre SQLite. El insert idempotente es `findMany` de sh_ids + `createMany` de los faltantes.
- **Comentarios y JSDoc en inglés**,-copy de la UI en español. `AGENTS.md`.
- **Sin emojis.**
- **No tocar `PRAGMA synchronous`**, ni el schema más allá de `playback_events`.
- Los loaders del frontend usan cadenas `.then`, nunca `async` en efectos: react-hooks v7 marca setState alcanzable desde funciones invocadas en efectos.

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `backend/prisma/schema/playback.prisma` | Modelo `PlaybackEvent` |
| `backend/prisma/schema/migrations/20261004000000_add_playback_events/migration.sql` | CREATE TABLE + 2 índices |
| `backend/src/modules/playback/playback.service.ts` | Recolección desde AzuraCast, mapeo, insert idempotente, backfill, poda, y las tres consultas de lectura |
| `backend/src/modules/playback/playback.job.ts` | Registro cron |
| `backend/src/modules/playback/playback.routes.ts` | Los tres endpoints admin con validación de query |
| `apps/web/src/pages/admin/AdminPlaybackHistory.tsx` | Página con dos pestañas y filtro compartido |

**Modificar:** `packages/types/src/admin.ts`, `apps/web/src/hooks/useAdminApi.ts`, `apps/web/src/main.tsx`, `apps/web/src/pages/admin/index.ts`, `apps/web/src/pages/admin/AdminLayout.tsx`, `backend/src/app.ts`, `backend/src/jobs/scheduler.ts`, `backend/src/modules/systemJobs/systemJobs.registry.ts`.

`playback.service.ts` grows: colección y lectura son responsabilidades distintas y ninguna depende de la otra. Se separan en `playback.service.ts` (lectura) y `playbackHistory.capture.ts` (escritura) para que cada archivo tenga una razón de cambio.

---

### Task 1: Modelo y migration

**Files:**
- Create: `backend/prisma/schema/playback.prisma`
- Create: `backend/prisma/schema/migrations/20261004000000_add_playback_events/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelo Prisma `PlaybackEvent` con campos `id`, `azuracastShId`, `playedAt`, `durationSec`, `songId`, `title`, `artist`, `album`, `playlist`, `streamer`, `isRequest`, `createdAt`. Available as `prisma.playbackEvent`.

- [ ] **Step 1: Escribir el modelo**

`backend/prisma/schema/playback.prisma`:

```prisma
// Una fila por reproducción detectada en el historial de AzuraCast.
// La metadata del audio se copia a la fila a propósito: resolverla contra
// la biblioteca de la estación obliga a paginar miles de archivos, y el
// historial se consulta mucho más a menudo que la biblioteca.
model PlaybackEvent {
  // sh_id de AzuraCast. Clave de idempotencia: permite consultar ventanas
  // solapadas entre corridas del job sin duplicar ni guardar un cursor.
  azuracastShId Int      @unique @map("azuracast_sh_id")
  playedAt      DateTime @map("played_at")
  durationSec   Int      @map("duration_sec")
  songId        String   @map("song_id")
  title         String
  artist        String   @default("")
  album         String   @default("")
  playlist      String   @default("")
  streamer      String   @default("")
  isRequest     Boolean  @default(false) @map("is_request")
  id            String   @id @default(uuid())
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("playback_events")
  // Sirve al log cronológico, al MAX(played_at) que fija la ventana del
  // siguiente poll y al DELETE de poda.
  @@index([playedAt])
  // No ayuda al GROUP BY (el planificador elige played_at por el filtro de
  // rango), pero resuelve la metadata de los audios de la página en 1,75 ms
  // en lugar de los 41 ms de un escaneo completo.
  @@index([songId])
}
```

- [ ] **Step 2: Escribir la migration a mano**

`backend/prisma/schema/migrations/20261004000000_add_playback_events/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "playback_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "azuracast_sh_id" INTEGER NOT NULL,
    "played_at" DATETIME NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "song_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL DEFAULT '',
    "album" TEXT NOT NULL DEFAULT '',
    "playlist" TEXT NOT NULL DEFAULT '',
    "streamer" TEXT NOT NULL DEFAULT '',
    "is_request" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "playback_events_azuracast_sh_id_key" ON "playback_events"("azuracast_sh_id");

-- CreateIndex
CREATE INDEX "playback_events_played_at_idx" ON "playback_events"("played_at");

-- CreateIndex
CREATE INDEX "playback_events_song_id_idx" ON "playback_events"("song_id");
```

Se escribe a mano y no con `prisma migrate dev` a propósito: el nombre de la carpeta debe ser exacto y el archivo queda en el repo como registro. La tabla es nueva, así que no hay datos que puedan perderse.

- [ ] **Step 3: Regenerar el cliente y verificar**

Run:
```bash
pnpm --filter radio-admin-backend run prisma:generate
pnpm --filter radio-admin-backend exec tsc --noEmit
```
Expected: ambos terminan sin error. `prisma:generate` imprime el nombre del cliente generado.

- [ ] **Step 4: Aplicar la migration en la base local**

Run:
```bash
pnpm --filter radio-admin-backend run prisma:migrate:deploy
```
Expected: `1 migration found in prisma/schema/migrations ... No pending migrations were found` o el nombre de la migration aplicada, sin error.

- [ ] **Step 5: Comprobar que la tabla existe**

Run:
```bash
pnpm --filter radio-admin-backend exec prisma db execute --schema prisma/schema --stdin
```
con `SELECT name FROM sqlite_master WHERE name='playback_events';` por stdin.

Expected: una fila `playback_events`. Si no aparece, la migration no se aplicó: repetir el Step 4.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema/playback.prisma backend/prisma/schema/migrations/20261004000000_add_playback_events
git commit -m "feat(playback): add playback_events table"
```

---

### Task 2: Recolección desde AzuraCast

**Files:**
- Create: `backend/src/modules/playback/playbackHistory.ts`

**Interfaces:**
- Consumes: `prisma` de `backend/src/infrastructure/database/prisma`; `azuracastApi` y `STATION_ID` de `backend/src/modules/azuracast/azuracast.client`; tipo `SongHistory` de `@radio/types`.
- Produces: `capturePlaybackHistory(): Promise<void>`, `PLAYBACK_RETENTION_DAYS: number`.

- [ ] **Step 1: Escribir el módulo**

`backend/src/modules/playback/playbackHistory.ts`:

```ts
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

function toRow(record: SongHistory) {
  return {
    azuracastShId: record.sh_id,
    playedAt: toDate(record.played_at),
    durationSec: record.duration,
    songId: record.song.id,
    title: record.song.title,
    artist: record.song.artist,
    album: record.song.album,
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
```

- [ ] **Step 2: Verificar que compila**

Run:
```bash
pnpm --filter radio-admin-backend exec tsc --noEmit
```
Expected: sin error. El backend declara `@radio/types` como dependencia (`backend/package.json`), así que el import de tipo es válido.

- [ ] **Step 3: Probar contra la estación real**

Con el backend levantado y las variables de entorno cargadas (`.env` o Infisical):

Run:
```bash
pnpm --filter radio-admin-backend exec ts-node -e "require('./src/modules/playback/playbackHistory').capturePlaybackHistory().then(()=>console.log('ok'))"
```
Expected: imprime `ok`. Si AzuraCast no es alcanzable desde esta máquina, este paso se pospone y se verifica en el servidor; el resto de tasks sí avanzan.

- [ ] **Step 4: Comprobar que la tabla se llenó y que no duplica**

Run (repetir el Step 3 dos veces seguidas):
```bash
pnpm --filter radio-admin-backend exec prisma db execute --schema prisma/schema --stdin
```
con `SELECT COUNT(*) AS total, COUNT(DISTINCT azuracast_sh_id) AS unicos FROM playback_events;` por stdin.

Expected: `total` mayor que 0 en la primera corrida e **idéntico** en la segunda. Si `total != unicos`, hay duplicados y el guard no está funcionando. Si `total` no crece tras el backfill, revisar que `fetchRange` devuelve datos: adding a log temporal del tamaño de `records` y quitarla después.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/playback/playbackHistory.ts
git commit -m "feat(playback): collect playback history from AzuraCast"
```

---

### Task 3: Consultas de lectura

**Files:**
- Create: `backend/src/modules/playback/playback.service.ts`

**Interfaces:**
- Consumes: `prisma`; `PLAYBACK_RETENTION_DAYS` de `./playbackHistory`; `getStationDayStartWithOffset` de `../../shared/utils/date`; `AppError` de `../../shared/errors/app-error`.
- Produces:
  - `interface PlaybackRange { from: Date; to: Date }`
  - `interface PlaybackFilters { range: PlaybackRange; playlist: string | null; search: string | null; automatedOnly: boolean }`
  - `interface ParsedPlaybackQuery { page: number; limit: number; filters: PlaybackFilters }`
  - `parsePlaybackQuery(query: Record<string, unknown>): ParsedPlaybackQuery`
  - `listPlaybackEvents(parsed: ParsedPlaybackQuery): Promise<{ rows: PlaybackEventRow[]; total: number; page: number; totalPages: number }>`
  - `listPlaybackAudios(parsed: ParsedPlaybackQuery, order: PlaybackAudioOrder): Promise<{ rows: PlaybackAudioRow[]; total: number; page: number; totalPages: number }>`
  - `listPlaybackPlaylists(): Promise<string[]>`
  - `type PlaybackAudioOrder = "plays" | "recent" | "first"`

- [ ] **Step 1: Escribir el servicio**

`backend/src/modules/playback/playback.service.ts`:

```ts
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
```

- [ ] **Step 2: Verificar que compila**

Run:
```bash
pnpm --filter radio-admin-backend exec tsc --noEmit
```
Expected: sin error.

Si Prisma se queja del `orderBy` del `groupBy`, la causa habitual es que el narrowing
del discriminante `order` se pierde al escribir el ternario inline. Declarar el orden en
una variable antes de la llamada:

```ts
const orderBy: Prisma.PlaybackEventGroupByOrderByWithRelationInput =
  order === "recent"
    ? { _max: { playedAt: "desc" } }
    : order === "first"
      ? { _min: { playedAt: "asc" } }
      : { _count: { songId: "desc" } };
```

y usarla en la llamada.

- [ ] **Step 3: Comprobar el plan de la consulta agregada**

Run:
```bash
pnpm --filter radio-admin-backend exec prisma db execute --schema prisma/schema --stdin
```
con
```sql
EXPLAIN QUERY PLAN
SELECT song_id, COUNT(*) FROM playback_events
WHERE played_at BETWEEN 1757000000 AND 1760000000
GROUP BY song_id ORDER BY COUNT(song_id) DESC LIMIT 20;
```
Expected: el filtro de rango resuelve por `playback_events_played_at_idx`. Un `USE TEMP B-TREE FOR GROUP BY` es lo esperado y lo que el spec asume: el coste está medido (49-58 ms a 90 días) y es aceptable porque la ventana está acotada.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/playback/playback.service.ts
git commit -m "feat(playback): add read queries for events and per-audio aggregates"
```

---

### Task 4: Rutas admin

**Files:**
- Create: `backend/src/modules/playback/playback.routes.ts`
- Modify: `backend/src/app.ts:29` (import) y `:139` (mount)

**Interfaces:**
- Consumes: `parsePlaybackQuery`, `listPlaybackEvents`, `listPlaybackAudios`, `listPlaybackPlaylists` de `./playback.service`; `requireAuth`, `requirePermission` de `../auth/auth.middleware`; `asyncHandler` de `../../shared/errors/async-handler`; `AppError`.
- Produces: default export `Router` con tres rutas bajo el prefijo `/admin-api/playback`.

- [ ] **Step 1: Escribir el router**

`backend/src/modules/playback/playback.routes.ts`:

```ts
import { Router } from "express";
import { asyncHandler } from "../../shared/errors/async-handler";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import {
  listPlaybackAudios,
  listPlaybackEvents,
  listPlaybackPlaylists,
  parsePlaybackQuery,
  type PlaybackAudioOrder,
} from "./playback.service";

const router = Router();

router.use(requireAuth);

// GET /admin-api/playback/log?from&to&playlist&search&automated&page&limit
router.get(
  "/log",
  requirePermission("dashboard"),
  asyncHandler(async (req, res) => {
    const parsed = parsePlaybackQuery(req.query as Record<string, unknown>);
    res.json(await listPlaybackEvents(parsed));
  })
);

// GET /admin-api/playback/audios?from&to&playlist&search&page&limit&order
router.get(
  "/audios",
  requirePermission("dashboard"),
  asyncHandler(async (req, res) => {
    const parsed = parsePlaybackQuery(req.query as Record<string, unknown>);
    const order: PlaybackAudioOrder =
      req.query.order === "recent" || req.query.order === "first" ? req.query.order : "plays";
    res.json(await listPlaybackAudios(parsed, order));
  })
);

// GET /admin-api/playback/filters
router.get(
  "/filters",
  requirePermission("dashboard"),
  asyncHandler(async (_req, res) => {
    res.json({ playlists: await listPlaybackPlaylists() });
  })
);

export default router;
```

`asyncHandler` convierte el `AppError` de validación en una respuesta 400 limpia; sin él, un `throw` dentro de un handler async async繁 no llega al `errorHandler`.

- [ ] **Step 2: Montar el router**

En `backend/src/app.ts`, añadir el import junto a los demás de `./modules/...` (después de la línea 37, `backupsRouter`):

```ts
import playbackRouter from "./modules/playback/playback.routes";
```

Y añadir el `app.use` junto al de `backupsRouter` (después de la línea 139):

```ts
app.use("/admin-api/playback", playbackRouter);
```

El orden importa: el router debe montarse **después** de `app.use("/admin-api", proxyRouter)` de la línea 114, igual que todos los demás, para que el proxy genérico no se quede con estas rutas.

- [ ] **Step 3: Verificar que compila**

Run:
```bash
pnpm --filter radio-admin-backend exec tsc --noEmit
```
Expected: sin error.

- [ ] **Step 4: Probar los tres endpoints**

Con el backend levantado y un token de admin válido:

Run:
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/admin-api/playback/log?limit=3"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/admin-api/playback/audios?limit=3"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/admin-api/playback/filters"
```
Expected: los tres devuelven JSON con `rows`, `total`, `page`, `totalPages`; el tercero devuelve `{ "playlists": [...] }`.

- [ ] **Step 5: Comprobar el rechazo de ventanas inválidas**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://localhost:3001/admin-api/playback/log?from=2020-01-01&to=2026-10-04"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://localhost:3001/admin-api/playback/log?from=2026-10-04&to=2026-10-01"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://localhost:3001/admin-api/playback/log?from=ayer"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/admin-api/playback/log"
```
Expected: `400`, `400`, `400`, `401`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/playback/playback.routes.ts backend/src/app.ts
git commit -m "feat(playback): expose playback history admin endpoints"
```

---

### Task 5: Registrar el job

**Files:**
- Create: `backend/src/modules/playback/playback.job.ts`
- Modify: `backend/src/jobs/scheduler.ts:7` y `:21` y `:28`
- Modify: `backend/src/modules/systemJobs/systemJobs.registry.ts:7`, `:13-24`, `:38-116`, `:118-130`

**Interfaces:**
- Consumes: `capturePlaybackHistory` de `./playbackHistory`; `config` de `../../config`; `logger` de `../../shared/logger/logger`.
- Produces: `registerPlaybackHistoryJob(): void`; nueva clave `playback-capture` en `SystemJobKey`, `SYSTEM_JOB_CATALOG` y `SYSTEM_JOB_RUNNERS`.

- [ ] **Step 1: Escribir el job**

`backend/src/modules/playback/playback.job.ts`:

```ts
import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { capturePlaybackHistory } from "./playbackHistory";

/**
 * Sincroniza el historial de reproducción de AzuraCast con la tabla local.
 * La ventana de consulta se solapa entre corridas y el insert es idempotente,
 * así que la frecuencia no afecta la completitud del historial.
 */
export function registerPlaybackHistoryJob() {
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await capturePlaybackHistory();
      } catch (err) {
        logger.warn("PlaybackHistory", "Capture failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
```

- [ ] **Step 2: Registrarlo en el scheduler**

En `backend/src/jobs/scheduler.ts`, añadir el import y la llamada:

```ts
import { registerPlaybackHistoryJob } from "../modules/playback/playback.job";
```

```ts
  registerListenerSamplingJob();
  registerPlaybackHistoryJob();
```

Y añadir `Playback Capture (every 5 min)` en el string de resumen de la línea 28, después de `Listener Sampling (every 5 min)`.

- [ ] **Step 3: Registrarlo en el panel de Jobs**

En `systemJobs.registry.ts`, cuatro cambios:

El import, junto a los demás:
```ts
import { capturePlaybackHistory } from "../playback/playbackHistory";
```

La unión `SystemJobKey`, añadiendo `| "playback-capture"`:
```ts
  | "listener-sampling"
  | "playback-capture"
```

En `SYSTEM_JOB_CATALOG`, después de la entrada `listener-sampling`:
```ts
  {
    key: "playback-capture",
    label: "Historial de reproducción",
    description: "Sincroniza el historial de reproducción de AzuraCast con la base de datos local.",
    schedule: "cada 5 min",
    requiresConfirm: false,
  },
```

En `SYSTEM_JOB_RUNNERS`:
```ts
  "playback-capture": capturePlaybackHistory,
```

- [ ] **Step 4: Verificar que compila**

Run:
```bash
pnpm --filter radio-admin-backend exec tsc --noEmit
```
Expected: sin error.

- [ ] **Step 5: Build completo, que regenera Prisma y swagger**

Run:
```bash
pnpm --filter radio-admin-backend build
```
Expected: sin error. Este es el paso que regenera `swagger-output.json` con las tres rutas nuevas; si falla, el error real está en `tsc`.

- [ ] **Step 6: Comprobar que aparece en el panel de Jobs**

Con el backend levantado: `GET /admin-api/jobs` con token de admin debe incluir `playback-capture` en el catálogo, y `POST /admin-api/jobs/playback-capture/run` debe devolver 200 y ejecutar una sincronización.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/playback/playback.job.ts backend/src/jobs/scheduler.ts backend/src/modules/systemJobs/systemJobs.registry.ts backend/swagger-output.json
git commit -m "feat(playback): schedule playback history sync every 5 minutes"
```

---

### Task 6: Tipos compartidos

**Files:**
- Modify: `packages/types/src/admin.ts` (añadir al final)

**Interfaces:**
- Produces: `PlaybackEventRow`, `PlaybackEventList`, `PlaybackAudioRow`, `PlaybackAudioList`, `PlaybackFilters`, `PlaybackAudioOrder`, `PlaybackLogQuery`.

- [ ] **Step 1: Añadir los tipos**

Al final de `packages/types/src/admin.ts`:

```ts
// ── Historial de reproducción ────────────────────────────────────────────

export type PlaybackAudioOrder = 'plays' | 'recent' | 'first';

export interface PlaybackEventRow {
  shId: number;
  playedAt: string;
  durationSec: number;
  songId: string;
  title: string;
  artist: string;
  album: string;
  playlist: string;
  streamer: string;
  isRequest: boolean;
}

export interface PlaybackEventList {
  rows: PlaybackEventRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PlaybackAudioRow {
  songId: string;
  title: string;
  artist: string;
  album: string;
  plays: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

export interface PlaybackAudioList {
  rows: PlaybackAudioRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PlaybackFilters {
  playlists: string[];
}

export interface PlaybackLogQuery {
  from: string;
  to: string;
  playlist?: string;
  search?: string;
  automated?: '0' | '1';
  page?: number;
  limit?: number;
}

export interface PlaybackAudioQuery extends PlaybackLogQuery {
  order?: PlaybackAudioOrder;
}
```

`playedAt` y `firstPlayedAt` / `lastPlayedAt` son `string` porque es lo que serializa
Express; el backend trabaja con `Date` internamente.

- [ ] **Step 2: Verificar que el paquete compila**

Run:
```bash
pnpm --filter @radio/types build
```
Expected: sin error. Si el paquete no expone script `build`, usar `pnpm --filter @radio/types exec tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/admin.ts
git commit -m "feat(types): add playback history response types"
```

---

### Task 7: Cliente API del frontend

**Files:**
- Modify: `apps/web/src/hooks/useAdminApi.ts` (imports de tipos cerca de la línea 50; funciones cerca de la línea 258)

**Interfaces:**
- Consumes: `PlaybackEventList`, `PlaybackAudioList`, `PlaybackFilters`, `PlaybackLogQuery`, `PlaybackAudioQuery` de `@radio/types`.
- Produces: `getPlaybackLog`, `getPlaybackAudios`, `getPlaybackFilters` en el objeto que devuelve `useAdminApi`.

- [ ] **Step 1: Añadir los imports de tipos**

En el bloque de `import type { ... } from '@radio/types'` de `useAdminApi.ts` (termina en la línea 50), añadir:

```ts
  PlaybackAudioList,
  PlaybackAudioQuery,
  PlaybackEventList,
  PlaybackFilters,
  PlaybackLogQuery,
```

- [ ] **Step 2: Añadir las tres funciones**

Después de `getReadingHistory` (que termina en la línea 258):

```ts
  // ── Historial de reproducción ──────────────────────────────────
  const getPlaybackLog = useCallback(
    (query: PlaybackLogQuery) =>
      request<PlaybackEventList>({
        url: '/admin-api/playback/log',
        params: query,
      }),
    [request]
  );

  const getPlaybackAudios = useCallback(
    (query: PlaybackAudioQuery) =>
      request<PlaybackAudioList>({
        url: '/admin-api/playback/audios',
        params: query,
      }),
    [request]
  );

  const getPlaybackFilters = useCallback(
    () =>
      request<PlaybackFilters>({
        url: '/admin-api/playback/filters',
      }),
    [request]
  );
```

Cada una es un `useCallback` con `[request]` como dependencia, igual que las demás. No
llevan timeout propio: el peor caso medido son ~120 ms, muy por debajo del default de
10 s de `request`.

- [ ] **Step 3: Verificar que compila**

Run:
```bash
pnpm --filter @radio/web lint
```
Expected: sin errores. Si `import type` es inválido por orden de members, `eslint` lo señala; entonces mover los imports al inicio de la línea de import y reordenar.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useAdminApi.ts
git commit -m "feat(web): add playback history API client"
```

---

### Task 8: Página del panel

**Files:**
- Create: `apps/web/src/pages/admin/AdminPlaybackHistory.tsx`
- Modify: `apps/web/src/main.tsx:48` y `:97`
- Modify: `apps/web/src/pages/admin/index.ts`
- Modify: `apps/web/src/pages/admin/AdminLayout.tsx:69` y `:30-37`

**Interfaces:**
- Consumes: `getPlaybackLog`, `getPlaybackAudios`, `getPlaybackFilters` de `useAdminApi`; `AdminPagination` de `@/components/ui-custom/AdminPagination`; tipos de `@radio/types`; `History` de `lucide-react`.
- Produces: default export `AdminPlaybackHistory`, registrado en la ruta `/admin/playback-history`.

- [ ] **Step 1: Crear la página**

`apps/web/src/pages/admin/AdminPlaybackHistory.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Search, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { useAdminApi } from '@/hooks/useAdminApi';
import type {
  PlaybackAudioOrder,
  PlaybackAudioRow,
  PlaybackEventRow,
} from '@radio/types';

type Tab = 'log' | 'audios';

const PAGE_SIZE = 20;
const WINDOW_OPTIONS = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
];
const ORDER_OPTIONS: { value: PlaybackAudioOrder; label: string }[] = [
  { value: 'plays', label: 'Más reproducidos' },
  { value: 'recent', label: 'Reproducidos recientemente' },
  { value: 'first', label: 'Reproducidos por primera vez' },
];

function dayKey(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function AdminPlaybackHistory() {
  const { getPlaybackLog, getPlaybackAudios, getPlaybackFilters } = useAdminApi();

  const [tab, setTab] = useState<Tab>('log');
  const [windowDays, setWindowDays] = useState('30');
  const [playlist, setPlaylist] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [automatedOnly, setAutomatedOnly] = useState(false);
  const [order, setOrder] = useState<PlaybackAudioOrder>('plays');

  const [logRows, setLogRows] = useState<PlaybackEventRow[]>([]);
  const [audioRows, setAudioRows] = useState<PlaybackAudioRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const range = useMemo(() => {
    const days = Number(windowDays);
    return { from: dayKey(-(days - 1)), to: dayKey(1) };
  }, [windowDays]);

  const query = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      playlist: playlist ?? undefined,
      search: search === '' ? undefined : search,
      automated: automatedOnly ? '1' : '0',
      page,
      limit: PAGE_SIZE,
    }),
    [range, playlist, search, automatedOnly, page]
  );

  useEffect(() => {
    let cancelled = false;
    getPlaybackFilters()
      .then((data) => {
        if (!cancelled) setPlaylists(data.playlists);
      })
      .catch(() => {
        if (!cancelled) setPlaylists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getPlaybackFilters, refreshToken]);

  // El texto se aplica con retardo para no lanzar una consulta por tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (tab === 'log') {
      getPlaybackLog(query)
        .then((data) => {
          if (cancelled) return;
          setLogRows(data.rows);
          setTotal(data.total);
          setTotalPages(data.totalPages);
        })
        .catch(() => {
          if (cancelled) return;
          setLogRows([]);
          setTotal(0);
          setTotalPages(1);
          setError('No se pudo cargar el historial de reproducción.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      getPlaybackAudios({ ...query, order })
        .then((data) => {
          if (cancelled) return;
          setAudioRows(data.rows);
          setTotal(data.total);
          setTotalPages(data.totalPages);
        })
        .catch(() => {
          if (cancelled) return;
          setAudioRows([]);
          setTotal(0);
          setTotalPages(1);
          setError('No se pudo cargar el historial de reproducción.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [tab, order, query, refreshToken, getPlaybackLog, getPlaybackAudios]);

  const handleRefresh = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  const rows = tab === 'log' ? logRows : audioRows;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historial de reproducción</h1>
          <p className="text-sm mt-0.5 text-faint">
            Qué se emitió, a qué hora y cuántas veces se reprodujo cada audio.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card className="border-border bg-muted/60">
        <CardContent className="p-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex gap-1 p-1 rounded-lg bg-card border border-border w-fit">
            {(['log', 'audios'] as Tab[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  tab === value ? 'bg-primary text-primary-foreground' : 'text-faint hover:text-foreground'
                }`}
              >
                {value === 'log' ? 'Reproducciones' : 'Por audio'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end flex-1">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-faint">Periodo</span>
              <Select value={windowDays} onValueChange={(value) => { setWindowDays(value); setPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-faint">Playlist</span>
              <Select
                value={playlist ?? 'all'}
                onValueChange={(value) => { setPlaylist(value === 'all' ? null : value); setPage(1); }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {playlists.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-medium text-faint">Buscar</span>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-faint" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Título o artista"
                  className="pl-8"
                  maxLength={200}
                />
              </div>
            </label>

            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={automatedOnly}
                onChange={(event) => { setAutomatedOnly(event.target.checked); setPage(1); }}
              />
              <span className="text-xs text-faint">Solo programación automática</span>
            </label>

            {tab === 'audios' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-faint">Orden</span>
                <Select value={order} onValueChange={(value) => { setOrder(value as PlaybackAudioOrder); setPage(1); }}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-muted/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            {tab === 'log' ? <Radio className="w-5 h-5 text-primary" /> : <History className="w-5 h-5 text-primary" />}
            <CardTitle className="text-base">
              {tab === 'log' ? 'Reproducciones' : 'Por audio'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, index) => (
                <div key={index} className="h-11 rounded-lg animate-pulse bg-muted" />
              ))}
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-faint">
              No hay reproducciones registradas en este periodo. El historial se sincroniza
              cada 5 minutos y conserva 90 días.
            </p>
          ) : tab === 'log' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Momento</TableHead>
                  <TableHead>Audio</TableHead>
                  <TableHead>Playlist</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logRows.map((row) => (
                  <TableRow key={row.shId}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatMoment(row.playedAt)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-foreground break-words">{row.title}</p>
                      {row.artist !== '' && <p className="text-xs text-faint">{row.artist}</p>}
                    </TableCell>
                    <TableCell className="text-faint">
                      <span className="flex items-center gap-2">
                        {row.playlist === '' ? '—' : row.playlist}
                        {row.streamer !== '' && <Badge variant="secondary" className="text-[10px]">DJ</Badge>}
                        {row.isRequest && <Badge variant="outline" className="text-[10px]">Pedido</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-faint">
                      {formatDuration(row.durationSec)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Audio</TableHead>
                  <TableHead className="text-right">Reproducciones</TableHead>
                  <TableHead>Primera</TableHead>
                  <TableHead>Última</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audioRows.map((row) => (
                  <TableRow key={row.songId}>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-foreground break-words">{row.title}</p>
                      {row.artist !== '' && <p className="text-xs text-faint">{row.artist}</p>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{row.plays}</TableCell>
                    <TableCell className="whitespace-nowrap text-faint">
                      {formatMoment(row.firstPlayedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-faint">
                      {formatMoment(row.lastPlayedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > 0 && (
            <div className="mt-4">
              <AdminPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                label={`${total} ${tab === 'log' ? 'reproducciones' : 'audios'}`}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Registrar la ruta y el import lazy**

En `apps/web/src/main.tsx`, añadir el import lazy después de la línea 48 (`AdminHealth`):

```tsx
const AdminPlaybackHistory = lazy(() => import('./pages/admin/AdminPlaybackHistory.tsx'))
```

Y la ruta después de la línea 97 (`health`):

```tsx
<Route path="playback-history" element={<AdminPlaybackHistory />} />
```

- [ ] **Step 3: Añadir el item al sidebar**

En `apps/web/src/pages/admin/AdminLayout.tsx`, añadir `History` al import de `lucide-react` (el bloque empieza en la línea 30) y añadir el item en la sección `Emisión`, después de `Salud`:

```tsx
      { to: '/admin/playback-history', label: 'Historial de reproducción', icon: History, permission: 'dashboard' },
```

El título del topbar sale de `resolveCurrentPage`, que hace coincidencia por prefijo más largo, así que esta ruta no necesita más registro. `/admin/playback-history` no colisiona con ninguna otra.

- [ ] **Step 4: Añadir el barrel**

En `apps/web/src/pages/admin/index.ts`, añadir:

```ts
export { default as AdminPlaybackHistory } from './AdminPlaybackHistory';
```

- [ ] **Step 5: Lint y build del frontend**

Run:
```bash
pnpm --filter @radio/web lint
pnpm --filter @radio/web build
```
Expected: sin errores ni warnings nuevos.

- [ ] **Step 6: Correr la suite existente**

Run:
```bash
pnpm --filter @radio/web test
```
Expected: los tres tests de `apps/web/tests/perf/` siguen pasando. El nuevo import no debe alterar el presupuesto de bundle ni las fronteras de import.

- [ ] **Step 7: Comprobar la página en el navegador**

Con backend y frontend levantados, entrar a `/admin/playback-history` como admin:

1. La pestaña "Reproducciones" muestra filas con momento, audio, playlist y duración.
2. La pestaña "Por audio" muestra el total de reproducciones por audio.
3. Cambiar el periodo a 7 días reduce el total.
4. Escribir en el desplegable de playlist filtra ambas pestañas.
5. Escribir texto que no existe muestra el estado vacío, no un error.
6. La paginación avanza y cambia los datos.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/admin/AdminPlaybackHistory.tsx apps/web/src/main.tsx apps/web/src/pages/admin/index.ts apps/web/src/pages/admin/AdminLayout.tsx
git commit -m "feat(web): add playback history page to admin panel"
```

---

## Verificación final

- [ ] `pnpm --filter radio-admin-backend exec tsc --noEmit`
- [ ] `pnpm --filter radio-admin-backend build`
- [ ] `pnpm --filter @radio/web lint`
- [ ] `pnpm --filter @radio/web build`
- [ ] `pnpm --filter @radio/web test`
- [ ] `git status --short` solo muestra `worker` ( submódulo) y `apps/mobile/.impeccable/`, que ya estaban modificados antes de este trabajo.

## Tests que deberían existir cuando haya suite

El backend no tiene framework y `AGENTS.md` prohíbe crear uno. Cuando exista, estos
casos merecen prueba, por orden de valor:

**`parsePlaybackQuery`** — ventana por defecto de 30 días; `from` posterior a `to`
rechazado; rango de más de 90 días rechazado; fecha mal formada rechazada; `limit`
mayor de 50 cae al máximo; `page` fuera de rango cae a 1; `search` de más de 200
caracteres rechazado.

**`buildWhere`** — `automatedOnly` filtra por `streamer` vacío; `search` genera el `OR`
sobre título y artista; los tres filtros se combinan.

**Ventana del job** — con la tabla vacía pide los últimos 30 días; con filas pide
`[max - 10 min, ahora]`; un hueco de varios días se divide por días. Esta es la
invariante que sostiene la ausencia de duplicados y la ausencia de huecos.

**Idempotencia** — correr `capturePlaybackHistory` dos veces sobre la misma respuesta
de AzuraCast deja el mismo número de filas.

**Agrupación** — dos plays del mismo `songId` con títulos distintos cuentan como un
solo grupo con el título más reciente. Es el motivo de la segunda consulta.

## Documentación

- [ ] Añadir la sección a `docs/backend-context.md`: módulo `playback`, modelo
      `PlaybackEvent`, endpoints, cron y el porqué de la metadata desnormalizada.
- [ ] Añadir la página a `docs/frontend-context.md`, en la sección del sistema de
      diseño admin.