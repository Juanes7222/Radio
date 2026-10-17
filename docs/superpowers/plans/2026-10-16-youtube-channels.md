# Canales de YouTube desde el panel - Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la lista de canales de YouTube se administre desde el panel admin y deje de vivir en variables de entorno, con su estado de suscripcion y las notificaciones recibidas a la vista.

**Architecture:** `YouTubeSubscription` se renombra a `YouTubeChannel` y pasa a ser la fuente de verdad: guarda el id, el nombre que le dio el admin, su categoria (`GENERAL` / `NEWS`) y las marcas del lease de suscripcion. Un router de administracion nuevo en `/admin-api/youtube` expone el CRUD, la renovacion forzada y el listado de notificaciones. La renovacion pasa de un `setInterval` en el bootstrap a un cron de 6 horas, porque el lease dura 24. El webhook pasa a rechazar notificaciones de canales que no estan dados de alta.

**Tech Stack:** TypeScript, Express, Prisma (SQLite), `fast-xml-parser`, `node-cron`, React 19 + Tailwind, vitest (solo `apps/web`).

**Spec:** `docs/superpowers/specs/2026-10-16-youtube-channels-design.md`

## Global Constraints

- TypeScript estricto en todas las capas. Nada de `any`; si es inevitable, aislarlo y explicarlo.
- Comentarios, JSDoc y nombres de codigo en ingles. Textos visibles al usuario, mensajes de validacion y labels en espanol.
- **El backend no tiene runner de pruebas y no se le agrega uno** (AGENTS.md). La verificacion de cada tarea de backend es `pnpm --filter @radio/backend build`, que corre `prisma generate` + `tsc`. Donde un cambio amerite una prueba, la tarea lo deja escrito.
- Las pruebas del panel van en `apps/web/tests/`, con vitest en entorno `node`. Son estaticas: leen el fuente, no renderizan.
- `apps/web/vitest.config.ts` incluye solo `tests/**/*.test.ts`. Un test nuevo es `.ts` y no importa React.
- Esquema de Prisma partido por dominio en `backend/prisma/schema/*.prisma`. Las migraciones son SQL escrito a mano en `backend/prisma/schema/migrations/<timestamp>_<nombre>/migration.sql`, con el timestamp `20261017000000`.
- El panel tiene un tema propio con clase `.admin-theme`. Se usan los tokens existentes (`--primary` ambar, `--success`, `--warning`, `--destructive`, `--faint`, `--muted-foreground`). **No se agregan colores.** `--tally` sigue reservado a lo que esta al aire.
- Fuentes: IBM Plex Sans Variable para nombres, IBM Plex Mono para ids, categorias y horas exactas. No se agregan fuentes.
- Errores de API en espanol con `AppError(status, "...")` de `backend/src/shared/errors/app-error.ts`, y handlers async con `asyncHandler`.
- Permiso: se reutiliza `youtube`. No se toca `AdminPermission`, `ADMIN_PERMISSIONS` ni `ADMIN_PERMISSION_LABELS`.

## Review Focus

Lo que el spec implica y que ninguna tarea cubre sola. Cada linea tiene su paso de verificacion en la tarea que posee el codigo.

1. **Deploy sin backfill.** Al borrar `YOUTUBE_CHANNEL_IDS` la ingesta se detiene en silencio hasta que alguien re-agrega los canales a mano (Tarea 6).
2. **Un canal borrado que el hub sigue empujando** durante su lease de 24h: el webhook tiene que ignorarlo en vez de crear filas (Tarea 5).
3. **La fila borrada y el hub caido.** Si el unsubscribe falla, la fila tiene que seguir borrada; el orden inverso deja un canal insuscribible (Tarea 4).
4. **`NOTICIAS` vs `CONTENIDO VARIADO` decidido en dos lugares.** El dispatcher y la subida del worker eligen carpeta y playlist, y si divergen el video acaba en una playlist y en la carpeta de otra (Tarea 7).
5. **Lease vencido entre dos pasadas.** Con cron de 6h y lease de 24h hay margen, pero un backend apagado mas de 24h deja todos los canales en `expiring` sin que nadie lo note hasta que llega el panel (Tarea 3).
6. **`router.use(requireAuth)` del router admin alcanzando `/webhook`.** El webhook lo llama el hub, sin sesion: si el router de administracion se monta antes y captura todo, la suscripcion muere de forma invisible (Tarea 5).

---

### Task 1: Modelo `YouTubeChannel`

**Files:**
- Modify: `backend/prisma/schema/youtube.prisma`
- Create: `backend/prisma/schema/migrations/20261017000000_youtube_channels/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelo Prisma `YouTubeChannel` con los campos `channelId`, `title`, `category`, `subscribedAt`, `expiresAt`, `lastNotifiedAt`, `subscriptionError`, `feedEntryCount`, `feedCheckedAt`, `createdAt`, `updatedAt`. Se elimina `YouTubeSubscription`.

- [ ] **Step 1: Escribir el modelo y borrar el viejo**

En `backend/prisma/schema/youtube.prisma` reemplazar el modelo `YouTubeSubscription` por:

```prisma
/// A YouTube channel the station watches. The row is the configuration, not a
/// mirror of the .env: `category` picks the news or the general destination and
/// `feedEntryCount` records what the public feed answered the last time it was
/// checked. `null` means "never checked", which is not the same as zero entries.
model YouTubeChannel {
  id                String    @id @default(uuid())
  channelId         String    @unique
  title             String
  category          String    @default("GENERAL")
  subscribedAt      DateTime?
  expiresAt         DateTime?
  lastNotifiedAt    DateTime?
  subscriptionError String?
  feedEntryCount    Int?
  feedCheckedAt     DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

- [ ] **Step 2: Escribir la migracion a mano**

Crear `backend/prisma/schema/migrations/20261017000000_youtube_channels/migration.sql`. SQLite no soporta renombrar tablas preservando indices en una sola sentencia, asi que la migracion crea la tabla nueva, copia lo que haya y borra la vieja:

```sql
-- The channel list is the panel's configuration now, so the table is named after
-- what it holds. `YouTubeSubscription` only ever received an upsert at boot and
-- was never read; its rows carry over as pending channels.
CREATE TABLE "YouTubeChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "subscribedAt" DATETIME,
    "expiresAt" DATETIME,
    "lastNotifiedAt" DATETIME,
    "subscriptionError" TEXT,
    "feedEntryCount" INTEGER,
    "feedCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "YouTubeChannel_channelId_key" ON "YouTubeChannel"("channelId");
INSERT INTO "YouTubeChannel" ("id", "channelId", "title", "category", "subscribedAt", "expiresAt", "createdAt", "updatedAt")
SELECT "id", "channelId", "channelId", 'GENERAL', "subscribedAt", "expiresAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "YouTubeSubscription";
DROP TABLE "YouTubeSubscription";
```

El `title` de las filas copiadas es el `channelId`: no hay nombre que recuperar, y el admin lo edita desde el panel. `feedEntryCount` queda `null`, o sea "sin verificar".

- [ ] **Step 3: Regenerar el cliente y compilar**

Run: `pnpm --filter @radio/backend build`
Expected: PASS. `tsc` falla porque `subscription.service.ts` todavia escribe en `YouTubeSubscription`; eso es esperado y lo arregla la Tarea 3. Para confirmar que la migracion en si esta bien, correr antes `pnpm --filter @radio/backend prisma:generate` y comprobar que no se queja del esquema.

- [ ] **Step 4: Aplicar la migracion en la base de desarrollo**

Run: `pnpm --filter @radio/backend prisma:migrate:deploy`
Expected: la migracion `20261017000000_youtube_channels` aplicada. Si Prisma pide resolverla a mano porque el SQL escrito no coincide con su diff, agregar `_prisma_migrations` a mano es incorrecto: lo correcto es regenerar con `prisma migrate dev --name youtube_channels` y conservar el SQL de arriba en el archivo generado.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema/youtube.prisma backend/prisma/schema/migrations/20261017000000_youtube_channels
git commit -m "feat(db): replace youtube subscription mirror with a channel registry"
```

---

### Task 2: Lectura del feed publico

**Files:**
- Create: `backend/src/modules/youtube/channelFeed.service.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `export interface ChannelFeedEntry { videoId: string; title: string; publishedAt: Date | null }`
  - `export interface ChannelFeedSnapshot { entries: ChannelFeedEntry[] }`
  - `export async function fetchChannelFeed(channelId: string): Promise<ChannelFeedSnapshot>`, que lanza `Error` si la red falla o el cuerpo no es XML. Una respuesta valida sin `<entry>` devuelve `{ entries: [] }`: eso no es un error, es el caso que el panel tiene que mostrar.

- [ ] **Step 1: Escribir el servicio**

```ts
import { XMLParser } from "fast-xml-parser";

export interface ChannelFeedEntry {
  videoId: string;
  title: string;
  publishedAt: Date | null;
}

export interface ChannelFeedSnapshot {
  entries: ChannelFeedEntry[];
}

const FEED_TIMEOUT_MS = 15_000;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function feedUrl(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

function toEntries(feed: unknown): ChannelFeedEntry[] {
  const raw = (feed as { entry?: unknown })?.entry;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const entries: ChannelFeedEntry[] = [];

  for (const item of list) {
    const entry = item as Record<string, unknown>;
    const videoId = entry["yt:videoId"];
    const title = entry["title"];
    if (typeof videoId !== "string" || typeof title !== "string") continue;
    const published = entry["published"];
    entries.push({
      videoId,
      title,
      publishedAt: typeof published === "string" ? new Date(published) : null,
    });
  }

  return entries;
}

/**
 * Reads the public Atom feed a WebSub topic points at. It answers `200` with an
 * empty stub for every channel id, including ids that do not exist, so the entry
 * count is the only signal about whether the channel will ever notify.
 */
export async function fetchChannelFeed(channelId: string): Promise<ChannelFeedSnapshot> {
  const response = await fetch(feedUrl(channelId), {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    headers: { Accept: "application/atom+xml" },
  });

  if (!response.ok) {
    throw new Error(`El feed respondio ${response.status}.`);
  }

  const parsed = parser.parse(await response.text()) as { feed?: unknown };
  return { entries: toEntries(parsed.feed) };
}
```

- [ ] **Step 2: Comprobar que el compilador acepta**

Run: `pnpm --filter @radio/backend build`
Expected: falla todavia por `YouTubeSubscription` (Tarea 1). No debe aparecer ningun error nuevo de este archivo.

- [ ] **Step 3: Comprobar el comportamiento real con un script de un solo uso**

Levantar un `ts-node` que llame `fetchChannelFeed("UCVqtYvLNHvGymJFoGeRH7nw")` y otro con un id inexistente. Los dos deben devolver `{ entries: [] }` y ninguna exception. Es el comportamiento medido el 16 de octubre de 2026: el endpoint devuelve los mismos 463 bytes para cualquier `channel_id`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/youtube/channelFeed.service.ts
git commit -m "feat(youtube): read the public channel feed"
```

---

### Task 3: Suscripcion sobre el registro

**Files:**
- Modify: `backend/src/modules/youtube/subscription.service.ts`

**Interfaces:**
- Consumes: `fetchChannelFeed` de la Tarea 2, modelo `YouTubeChannel` de la Tarea 1.
- Produce:
  - `export async function subscribeToChannel(channelId: string): Promise<void>`: suscribe en el hub y escribe `subscribedAt` / `expiresAt`; deja `subscriptionError` en `null`.
  - `export async function unsubscribeFromChannel(channelId: string): Promise<void>`: avisa al hub con `hub.mode=unsubscribe`, no toca la base y propaga el error para que quien llame lo registre.
  - `export async function refreshChannelSubscriptions(): Promise<void>`: por cada canal, renueva el lease si esta vencido o sin `subscribedAt`, y refresca el conteo del feed.

- [ ] **Step 1: Reescribir el archivo**

```ts
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { prisma } from "../../infrastructure/database/prisma";
import { fetchChannelFeed } from "./channelFeed.service";

const PUBSUBHUBBUB_HUB = "https://pubsubhubbub.appspot.com/subscribe";
const LEASE_SECONDS = 86400; // 24 hours
const RESUBSCRIBE_MARGIN_MS = 6 * 60 * 60 * 1000; // renew once the lease is inside one cron pass

export const WEBHOOK_PATH = "/admin-api/youtube/webhook";

function topicUrl(channelId: string): string {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

async function callHub(mode: "subscribe" | "unsubscribe", channelId: string): Promise<void> {
  const params = new URLSearchParams({
    "hub.callback": `${config.publicUrl}${WEBHOOK_PATH}`,
    "hub.topic": topicUrl(channelId),
    "hub.mode": mode,
    "hub.lease_seconds": String(LEASE_SECONDS),
    "hub.verify": "async",
  });

  const response = await fetch(PUBSUBHUBBUB_HUB, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status !== 202 && response.status !== 200 && response.status !== 204) {
    throw new Error(`Subscription failed [${response.status}]: ${await response.text()}`);
  }
}

export async function subscribeToChannel(channelId: string): Promise<void> {
  try {
    await callHub("subscribe", channelId);
    const now = new Date();
    await prisma.youTubeChannel.update({
      where: { channelId },
      data: {
        subscribedAt: now,
        expiresAt: new Date(now.getTime() + LEASE_SECONDS * 1000),
        subscriptionError: null,
      },
    });
  } catch (err) {
    await prisma.youTubeChannel.update({
      where: { channelId },
      data: { subscriptionError: String(err) },
    });
    throw err;
  }
}

export async function unsubscribeFromChannel(channelId: string): Promise<void> {
  await callHub("unsubscribe", channelId);
}

/**
 * Renews the lease and rechecks the feed of every registered channel. Both
 * failures are recorded on the row instead of thrown: one unreachable hub or one
 * dead feed must not stop the rest of the channels from being refreshed.
 */
export async function refreshChannelSubscriptions(): Promise<void> {
  const channels = await prisma.youTubeChannel.findMany();

  for (const channel of channels) {
    const now = Date.now();
    const leaseEndsSoon =
      channel.expiresAt === null || channel.expiresAt.getTime() - now <= RESUBSCRIBE_MARGIN_MS;

    if (leaseEndsSoon) {
      try {
        await subscribeToChannel(channel.channelId);
      } catch (err) {
        logger.error("SubscriptionService", "Failed to renew subscription", {
          channelId: channel.channelId,
          error: String(err),
        });
      }
    }

    try {
      const { entries } = await fetchChannelFeed(channel.channelId);
      await prisma.youTubeChannel.update({
        where: { channelId: channel.channelId },
        data: { feedEntryCount: entries.length, feedCheckedAt: new Date() },
      });
    } catch (err) {
      logger.warn("SubscriptionService", "Could not check the channel feed", {
        channelId: channel.channelId,
        error: String(err),
      });
    }
  }
}
```

`subscribeToChannel` ahora escribe el error en la fila antes de propagarlo, y no tiene un `upsert`: la fila se crea en `channel.service.ts` antes de suscribir, asi que un canal que llega al hub sin fila es un bug de llamador, no un caso que silenciar.

- [ ] **Step 2: Compilar**

Run: `pnpm --filter @radio/backend build`
Expected: falla solo por los dos consumidores que aun piden `subscribeToAllConfiguredChannels` (`index.ts`) y `config.youtube` (`jobDispatcher.ts`, `workerAdmin.routes.ts`). No debe haber errores dentro de este archivo.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/youtube/subscription.service.ts
git commit -m "feat(youtube): renew leases and recheck feeds from the channel registry"
```

---

### Task 4: Servicio de canales

**Files:**
- Create: `backend/src/modules/youtube/channel.service.ts`

**Interfaces:**
- Consumes: `subscribeToChannel`, `unsubscribeFromChannel` de la Tarea 3.
- Produce:
  - `export const YOUTUBE_CHANNEL_CATEGORIES = ["GENERAL", "NEWS"] as const`
  - `export type YoutubeChannelCategory = (typeof YOUTUBE_CHANNEL_CATEGORIES)[number]`
  - `export function parseChannelId(input: string): string` — acepta `UC...`, `@handle` y URLs completas de YouTube; lanza `AppError(400, ...)` si no puede reducirse a un id.
  - `export function isYoutubeChannelCategory(value: string): value is YoutubeChannelCategory`
  - `export async function listChannels(): Promise<YouTubeChannelInfo[]>`
  - `export async function createChannel(input: { channelId: string; title: string; category?: YoutubeChannelCategory }): Promise<YouTubeChannelInfo>`
  - `export async function deleteChannel(channelId: string): Promise<void>`
  - `export async function resubscribeChannel(channelId: string): Promise<YouTubeChannelInfo>`
  - `export async function markChannelNotified(channelId: string): Promise<void>`
  - `export async function channelCategoryOf(channelId: string): Promise<YoutubeChannelCategory>`

  `parseChannelId` no vive aqui: va en `channelId.ts` (Tarea 4, nota de abajo), porque el backfill de la Tarea 6 lo necesita y arrastrar este servicio lo meteria en toda la configuracion del backend.

  **Nota sobre `channelId.ts`.** `channel.service.ts` importa `subscription.service.ts`, que importa `config`, y `config` lanza en el import si falta cualquier variable requerida. El backfill solo tiene que escribir filas: importarlo desde aca lo hacia fallar con `Env WORKER_AUTH_SECRET is not defined`. Por eso `parseChannelId` va en un modulo propio, sin dependencias de configuracion. Verificado: el script fallaba asi antes de separarlo.

- [ ] **Step 1: Escribir los guards en `channelId.ts` y en el servicio**

```ts
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

export function parseChannelId(input: string): string {
  const value = input.trim();

  if (CHANNEL_ID_PATTERN.test(value)) return value;

  // A channel URL carries the id either as a query parameter or as the path
  // segment after /channel/. @handles carry no id at all: resolving one needs a
  // Google credential, so the admin pastes the id itself.
  const fromQuery = /[?&]channel_id=([\w-]+)/.exec(value)?.[1];
  const fromPath = /\/channel\/(UC[\w-]{22})/.exec(value)?.[1];

  const resolved = fromQuery ?? fromPath;
  if (resolved && CHANNEL_ID_PATTERN.test(resolved)) return resolved;

  throw new AppError(
    400,
    "No se pudo leer el canal. Pega el identificador (empieza por UC) o la URL del canal."
  );
}
```

`@handle` no se resuelve a proposito, y el mensaje de error lo dice, para que el admin no lo descubra copiando un `@nombre` y esperando un resultado.

- [ ] **Step 2: Escribir el estado derivado**

```ts
type ChannelState = "subscribed" | "expiring" | "failed" | "unverified";

function stateOf(channel: ChannelRow, now: number): ChannelState {
  if (channel.subscriptionError !== null) return "failed";
  if (channel.feedEntryCount === null) return "unverified";
  if (channel.expiresAt === null || channel.expiresAt.getTime() - now <= 6 * 60 * 60 * 1000) {
    return "expiring";
  }
  return "subscribed";
}
```

El estado nunca se guarda: derivarlo evita que la base pueda contener un estado que contradiga sus propias fechas. `expiring` usa el mismo margen de 6 horas que `RESUBSCRIBE_MARGIN_MS` en la Tarea 3, para que la fila diga "por renovar" exactamente cuando el cron va a renovar.

- [ ] **Step 3: Escribir `listChannels` y `createChannel`**

`listChannels` lee las filas, trae la ultima notificacion de cada canal con un `groupBy` sobre `YouTubeVideo` por `channelId` con `max(createdAt)`, y arma `YouTubeChannelInfo` con los campos del contrato del spec. Orden: `createdAt` descendente.

`createChannel` valida en este orden y en este orden solamente:

1. `channelId = parseChannelId(input.channelId)`.
2. `title` no vacio tras `trim`, o `AppError(400, "El nombre del canal es obligatorio.")`.
3. `category` por defecto `GENERAL`; si viene algo que no es `GENERAL` ni `NEWS`, `AppError(400, "La categoria debe ser GENERAL o NEWS.")`.
4. Si ya existe la fila, `AppError(409, "Ese canal ya esta en la lista.")`.
5. `prisma.youTubeChannel.create(...)`.
6. `subscribeToChannel(channelId)` dentro de un `try/catch`: si falla, el `catch` solo deja el log, porque `subscribeToChannel` ya escribio `subscriptionError` en la fila.
7. `fetchChannelFeed(channelId)` en un `try/catch` que escribe `feedEntryCount` y `feedCheckedAt`; si falla, `feedEntryCount` queda en su valor anterior y el error va al log.
8. Devuelve la fila releida.

El alta **no** se rechaza cuando el feed viene vacio. Un canal existe aunque YouTube no avise, y bloquearlo dejaria al admin sin forma de registrar un canal que todavia no publico nada. El `feedEntryCount: 0` es lo que el panel muestra.

- [ ] **Step 4: Escribir `deleteChannel`**

```ts
export async function deleteChannel(channelId: string): Promise<void> {
  const channel = await prisma.youTubeChannel.findUnique({ where: { channelId } });
  if (!channel) throw new AppError(404, "Ese canal no esta en la lista.");

  // The row goes first: the hub may keep pushing for the rest of the 24 hour
  // lease, and the webhook ignores channels it does not know. The other order
  // would leave a row the hub no longer serves and nobody can resubscribe.
  await prisma.youTubeChannel.delete({ where: { channelId } });

  try {
    await unsubscribeFromChannel(channelId);
  } catch (err) {
    logger.warn("YoutubeChannels", "The hub did not confirm the unsubscribe", {
      channelId,
      error: String(err),
    });
  }
}
```

Los videos ya recibidos **no** se borran: son historial de emision y la tabla de jobs los sigue listando aunque la fila del canal ya no exista.

- [ ] **Step 5: Escribir `resubscribeChannel`, `markChannelNotified` y `channelCategoryOf`**

- `resubscribeChannel`: `AppError(404)` si no esta; llama `subscribeToChannel` dentro de `try/catch` sin relanzar (el error quedo en la fila), y devuelve la fila releida.
- `listNotifications(limit)`: **NO se implementa.** El spec la pedia y se quito durante la ejecucion: la tabla de jobs de la pagina ya lista los mismos videos con mas datos (el webhook crea `YouTubeVideo` y `ProcessingJob` juntos, uno a uno, sin excepcion), asi que un segundo listado era contenido duplicado en una pagina que justo se quejo de tener demasiado. Lo que si hace falta y no estaba, el "por canal", es `lastNotifiedAt` en `YouTubeChannelInfo`. Ver "Por que no hay una lista aparte de notificaciones" en el spec.
- `markChannelNotified(channelId)`: `updateMany({ where: { channelId }, data: { lastNotifiedAt: new Date() } })`. Devuelve `Promise<void>` y no lanza si no hay fila: es una anotacion, no una condicion.
- `channelCategoryOf(channelId)`: `const row = await prisma.youTubeChannel.findUnique({ where: { channelId }, select: { category: true } }); if (!row) return "GENERAL"; return isYoutubeChannelCategory(row.category) ? row.category : "GENERAL";`. El default es `GENERAL` porque es la destino de todo lo que no es noticia, y una fila con una categoria corrupta no debe dejar el video sin destino. El `if (!row)` separado es obligatorio: encadenar `isYoutubeChannelCategory(row?.category ?? "")` no estrecha el tipo y `tsc` lo rechaza con `TS18047`.

- [ ] **Step 6: Compilar**

Run: `pnpm --filter @radio/backend build`
Expected: este archivo compila limpio. Los errores que quedan son los de las tareas 5, 6 y 7.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/youtube/channel.service.ts
git commit -m "feat(youtube): manage channels as registry rows instead of env list"
```

---

### Task 5: Router de administracion, webhook y cron

**Files:**
- Create: `backend/src/modules/youtube/youtube.admin.routes.ts`
- Modify: `backend/src/modules/youtube/youtube.routes.ts`
- Create: `backend/src/modules/youtube/youtube.subscription.job.ts`
- Modify: `backend/src/jobs/scheduler.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: todo `channel.service.ts` (Tarea 4) y `subscription.service.ts` (Tarea 3).
- Produce: los endpoints de la tabla del spec, el cron de 6 horas, y `registerYoutubeSubscriptionJob()`.

- [ ] **Step 1: Escribir `youtube.admin.routes.ts`**

```ts
import { Router, type Request, type Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import { asyncHandler } from "../../shared/errors/async-handler";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import {
  createChannel,
  deleteChannel,
  isYoutubeChannelCategory,
  listChannels,
  resubscribeChannel,
  YOUTUBE_CHANNEL_CATEGORIES,
} from "./channel.service";

const router = Router();

router.use(requireAuth, requirePermission("youtube"));

router.get(
  "/channels",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ channels: await listChannels() });
  })
);

router.post(
  "/channels",
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const category = body.category ?? "GENERAL";
    if (typeof category !== "string" || !isYoutubeChannelCategory(category)) {
      throw new AppError(400, "La categoria debe ser GENERAL o NEWS.");
    }
    const channelId = typeof body.channelId === "string" ? body.channelId : "";
    const title = typeof body.title === "string" ? body.title : "";

    res.status(201).json(
      await createChannel({ channelId, title, category })
    );
  })
);

router.delete(
  "/channels/:channelId",
  asyncHandler(async (req: Request, res: Response) => {
    await deleteChannel(String(req.params.channelId));
    res.status(204).end();
  })
);

router.post(
  "/channels/:channelId/resubscribe",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await resubscribeChannel(String(req.params.channelId)));
  })
);

export default router;
```

`YOUTUBE_CHANNEL_CATEGORIES` no se usa todavia en este archivo; no lo importes hasta que la pagina lo pida. Si el compilador se queja de la importacion sin uso, quitarla.

- [ ] **Step 2: Montarlo antes del webhook en `app.ts`**

En `backend/src/app.ts`, agregar el import cerca de `youtubeRouter`:

```ts
import youtubeAdminRouter from "./modules/youtube/youtube.admin.routes";
```

y registrarlo **antes** de la linea `app.use("/admin-api/youtube", youtubeRouter)`:

```ts
  app.use("/admin-api/youtube", youtubeAdminRouter);
  app.use("/admin-api/youtube", youtubeRouter);
```

El orden importa aunque las rutas no choquen (`/channels*` contra `/webhook`), porque el `router.use(requireAuth)` del router de administracion se aplica a todo lo que pase por el. Si el orden se invierte y el router de administracion atrapa el resto, el hub recibe un 401 y la suscripcion deja de funcionar sin error visible.

- [ ] **Step 3: Hacer que el webhook ignore canales desconocidos**

En `backend/src/modules/youtube/youtube.routes.ts`, despues de parsear la entrada y antes del `findUnique` de duplicados, agregar:

```ts
  // A channel removed from the panel can still be pushed for the rest of its
  // 24 hour lease. Creating a job for it would put content on air that the admin
  // deliberately took off the list, so the notification is dropped instead.
  const channel = await prisma.youTubeChannel.findUnique({
    where: { channelId },
    select: { id: true },
  });
  if (!channel) {
    logger.warn("YouTubeRouter", "Notification from a channel that is not registered", {
      videoId,
      channelId,
    });
    return;
  }
```

y despues de crear el video, marcar la notificacion:

```ts
  await markChannelNotified(channelId);
```

El `200` del principio del handler no se toca: el hub no debe reintentar.

- [ ] **Step 4: Escribir el cron**

`backend/src/modules/youtube/youtube.subscription.job.ts`:

```ts
import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { refreshChannelSubscriptions } from "./subscription.service";

export function registerYoutubeSubscriptionJob() {
  // The lease lasts 24 hours, so a 6 hour pass leaves three retries before it
  // actually lapses. The interval used to be a hand-written setInterval in the
  // bootstrap, which put the cadence outside every config file.
  cron.schedule(
    "17 */6 * * *",
    async () => {
      try {
        await refreshChannelSubscriptions();
      } catch (err) {
        logger.error("YoutubeSubscriptions", "Refresh failed", { error: String(err) });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
```

El minuto es `17` a proposito: los demas jobs del proyecto corren en minutos redondos y coincidir con ellos concentra las llamadas al hub en el mismo segundo.

- [ ] **Step 5: Registrar el cron y sacar el `setInterval`**

En `backend/src/jobs/scheduler.ts`, agregar el import y la llamada `registerYoutubeSubscriptionJob();` junto a `registerJobRecovery();`, y sumar `YouTube Subscriptions (every 6 h)` al string de log de la linea 36.

En `backend/src/index.ts`, borrar `YOUTUBE_RESUBSCRIBE_INTERVAL_MS`, el import de `subscribeToAllConfiguredChannels`, la linea `await subscribeToAllConfiguredChannels();` y el `setInterval`. En su lugar, despues de `setInterval(dispatchPendingJobs, ...)`, agregar:

```ts
  // Fire and forget: ingestion should not wait for the hub, and a station with no
  // channels registered answers instantly anyway.
  void refreshChannelSubscriptions().catch((err) => {
    logger.error("Bootstrap", "Initial YouTube subscription refresh failed", {
      error: String(err),
    });
  });
```

El `setInterval` viejo no se reemplaza por otro `setInterval`: el cron ya cubre la cadencia.

- [ ] **Step 6: Anotar el registro en `systemJobs`**

En `backend/src/modules/systemJobs/systemJobs.registry.ts`, agregar `"youtube-subscriptions"` al union `SystemJobKey`, una entrada de catalogo con `label: "Suscripciones de YouTube"`, `description: "Renueva el lease de cada canal y vuelve a comprobar su feed."`, `schedule: "cada 6 h"`, `requiresConfirm: false`, y el runner `"youtube-subscriptions": refreshChannelSubscriptions`.

- [ ] **Step 7: Compilar**

Run: `pnpm --filter @radio/backend build`
Expected: PASS, salvo los tres consumidores de `config.youtube` de la Tarea 7. No puede quedar ninguna referencia a `subscribeToAllConfiguredChannels`.

Run: `pnpm --filter @radio/backend exec tsc --noEmit -p tsconfig.json 2>&1 | Select-String "config.youtube"`
Expected: solo las tres lineas de la Tarea 7.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/youtube/youtube.admin.routes.ts backend/src/modules/youtube/youtube.routes.ts backend/src/modules/youtube/youtube.subscription.job.ts backend/src/jobs/scheduler.ts backend/src/app.ts backend/src/index.ts backend/src/modules/systemJobs/systemJobs.registry.ts
git commit -m "feat(youtube): expose channel management and move resubscribe to a cron"
```

---

### Task 6: Retirar las variables de entorno

**Files:**
- Delete: `backend/src/config/youtube.config.ts`
- Modify: `backend/src/config/index.ts`
- Modify: `backend/.env.example`
- Modify: `docs/infisical-setup.md`
- Create: `backend/src/scripts/backfillYoutubeChannels.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: modelo `YouTubeChannel` (Tarea 1).
- Produce: script `pnpm --filter @radio/backend youtube-channels:backfill`, de una sola ejecucion, que lee `YOUTUBE_CHANNEL_IDS` y `YOUTUBE_CHANNEL_NOTICES` del entorno y escribe las filas. `feedEntryCount` queda en `null`, o sea "sin verificar": el cron las verifica en su primera pasada.

- [ ] **Step 1: Escribir el backfill antes de borrar las variables**

`backend/src/scripts/backfillYoutubeChannels.ts`:

```ts
import "dotenv/config";
import { prisma } from "../infrastructure/database/prisma";
import { parseChannelId } from "../modules/youtube/channel.service";

function listFromEnv(key: string): string[] {
  return (process.env[key] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const general = listFromEnv("YOUTUBE_CHANNEL_IDS");
  const news = listFromEnv("YOUTUBE_CHANNEL_NOTICES");

  for (const [channelIds, category] of [
    [general, "GENERAL"],
    [news, "NEWS"],
  ] as const) {
    for (const raw of channelIds) {
      let channelId: string;
      try {
        channelId = parseChannelId(raw);
      } catch {
        console.error(`[backfill] no se pudo leer el canal "${raw}", se omite`);
        continue;
      }
      await prisma.youTubeChannel.upsert({
        where: { channelId },
        create: { channelId, title: channelId, category },
        update: {},
      });
      console.log(`[backfill] ${channelId} -> ${category}`);
    }
  }

  console.log(`[backfill] listo. ${general.length + news.length} canales revisados.`);
  console.log("[backfill] borra YOUTUBE_CHANNEL_IDS y YOUTUBE_CHANNEL_NOTICES de Infisical.");
}

main().finally(() => prisma.$disconnect());
```

`update: {}` es deliberado: el script corre una vez y no debe pisar lo que el admin ya haya editado en el panel.

- [ ] **Step 2: Registrar el script y probarlo contra la base de desarrollo**

Agregar a `backend/package.json`:

```json
"youtube-channels:backfill": "ts-node src/scripts/backfillYoutubeChannels.ts"
```

Run: `$env:YOUTUBE_CHANNEL_IDS="UCVqtYvLNHvGymJFoGeRH7nw"; pnpm --filter @radio/backend youtube-channels:backfill`
Expected: imprime `UCVqtYvLNHvGymJFoGeRH7nw -> GENERAL` y `listo. 1 canales revisados.`

Run: `$env:YOUTUBE_CHANNEL_IDS=""; pnpm --filter @radio/backend youtube-channels:backfill`
Expected: imprime `listo. 0 canales revisados.` y no falla.

- [ ] **Step 3: Borrar la config y sus consumidores**

Eliminar `backend/src/config/youtube.config.ts`. En `backend/src/config/index.ts` quitar el import de `youtubeConfig` y la linea `youtube: youtubeConfig,` del objeto `config`.

En `backend/.env.example`, borrar la linea `YOUTUBE_CHANNEL_IDS=UCVqtYvLNHvGymJFoGeRH7nw` y dejar el bloque de YouTube con un comentario que diga que los canales se administran desde el panel.

En `docs/infisical-setup.md`, quitar `YOUTUBE_CHANNEL_IDS` de la lista de secretos opcionales.

Run: `pnpm --filter @radio/backend exec tsc --noEmit -p tsconfig.json 2>&1 | Select-String "config\.youtube"`
Expected: las tres referencias de `jobDispatcher.ts`, `workerAdmin.routes.ts` e `index.ts`. `index.ts` ya quedo limpio en la Tarea 5, asi que son dos. Ninguna mas.

- [ ] **Step 4: Buscar que no quede ninguna referencia a las variables**

Run: `Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx,*.md,.env.example -Path backend,apps,packages,docs -ErrorAction SilentlyContinue).FullName -Pattern "YOUTUBE_CHANNEL_IDS|YOUTUBE_CHANNEL_NOTICES"`
Expected: solo el backfill (que las lee a proposito) y el `.env.example` si quedo el comentario. Nada mas.

- [ ] **Step 5: Commit**

```bash
git add -A backend/src/config backend/.env.example docs/infisical-setup.md backend/src/scripts backend/package.json
git commit -m "feat(youtube): retire the channel list env vars and add a one-shot backfill"
```

---

### Task 7: La categoria decide el destino del video

**Files:**
- Modify: `backend/src/modules/workers/jobDispatcher.ts:75-78`
- Modify: `backend/src/modules/workers/workerAdmin.routes.ts:193-199`

**Interfaces:**
- Consumes: `channelCategoryOf` de la Tarea 4.
- Produce: los dos caminos de subida eligen carpeta y playlist desde la fila del canal.

- [ ] **Step 1: Cambiar el dispatcher**

Reemplazar en `jobDispatcher.ts`:

```ts
  const isNewsChannel = config.youtube.noticeChanelIds.includes(video.channelId);
  const playlistId = isNewsChannel
    ? config.azuracast.newsPlaylistId
    : config.azuracast.playlistId;
```

por:

```ts
  const category = await channelCategoryOf(video.channelId);
  const playlistId =
    category === "NEWS" ? config.azuracast.newsPlaylistId : config.azuracast.playlistId;
```

y agregar el import de `channelCategoryOf` desde `../youtube/channel.service`.

- [ ] **Step 2: Cambiar la subida del worker**

Reemplazar en `workerAdmin.routes.ts`:

```ts
    const isNewsChannel = config.youtube.noticeChanelIds.includes(video?.channelId ?? "");
    const playlistId =
      req.body.playlistId ||
      (isNewsChannel ? config.azuracast.newsPlaylistId : config.azuracast.playlistId) ||
      undefined;
    const folder = isNewsChannel ? "NOTICIAS" : "CONTENIDO VARIADO";
```

por:

```ts
    const category = await channelCategoryOf(video?.channelId ?? "");
    const playlistId =
      req.body.playlistId ||
      (category === "NEWS" ? config.azuracast.newsPlaylistId : config.azuracast.playlistId) ||
      undefined;
    const folder = category === "NEWS" ? "NOTICIAS" : "CONTENIDO VARIADO";
```

La variable `video` de la linea 193 ya no se usa para nada mas, asi que se deja como esta: sigue alimentando el resto del handler a traves de `video?.channelId`.

- [ ] **Step 3: Compilar y confirmar que las dos rutas coinciden**

Run: `pnpm --filter @radio/backend build`
Expected: PASS, sin errores. Ya no debe quedar ninguna referencia a `config.youtube` en todo el backend.

Run: `Select-String -Path backend/src/**/*.ts -Pattern "config\.youtube"`
Expected: sin resultados.

Run: `Select-String -Path backend/src/modules/workers/jobDispatcher.ts,backend/src/modules/workers/workerAdmin.routes.ts -Pattern 'category === "NEWS"'`
Expected: un resultado en cada archivo. Es el invariante que dice el punto 4 de Review Focus: los dos caminos tienen que leer la misma fila.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/workers/jobDispatcher.ts backend/src/modules/workers/workerAdmin.routes.ts
git commit -m "feat(workers): route videos by the channel row instead of an env list"
```

---

### Task 8: Contratos compartidos

**Files:**
- Modify: `packages/types/src/admin.ts` (despues de `WorkerJob`, linea 1094)

**Interfaces:**
- Produces:
  - `export type YoutubeChannelCategory = "GENERAL" | "NEWS"`
  - `export type YoutubeChannelState = "subscribed" | "expiring" | "failed" | "unverified"`
  - `export interface YouTubeChannelInfo { channelId, title, category, state, lastNotifiedAt, leaseExpiresAt, subscriptionError, feedEntryCount, feedCheckedAt, createdAt }`
  - `export interface YouTubeChannelListResponse { channels: YouTubeChannelInfo[] }`

`YouTubeNotification` **no se agrega**: sin el endpoint `/notifications` no tendria consumidor, y un tipo exportado sin usar es codigo que el proximo mantiene sin saber para que existio.

Los nombres llevan el prefijo `YouTube` a proposito: el cliente ya genera `YouTubeChannel` desde Prisma, y un mismo nombre en los dos lados se-shadowearia al importar.

- [ ] **Step 1: Agregar los tipos**

```ts
/** Destination of a channel: the news folder and playlist, or the general one. */
export type YoutubeChannelCategory = "GENERAL" | "NEWS";

/** Derived from the row's own dates, never stored. */
export type YoutubeChannelState = "subscribed" | "expiring" | "failed" | "unverified";

/** A channel the station watches, as the panel lists it. */
export interface YouTubeChannelInfo {
  channelId: string;
  title: string;
  category: YoutubeChannelCategory;
  state: YoutubeChannelState;
  lastNotifiedAt: string | null;
  leaseExpiresAt: string | null;
  subscriptionError: string | null;
  feedEntryCount: number | null;
  feedCheckedAt: string | null;
  createdAt: string;
}

export interface YouTubeChannelListResponse {
  channels: YouTubeChannelInfo[];
}
```

- [ ] **Step 2: Compilar los contratos**

Run: `pnpm --filter @radio/types typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/admin.ts
git commit -m "feat(types): add the youtube channel contracts"
```

---

### Task 9: Cliente del panel

**Files:**
- Modify: `apps/web/src/hooks/useAdminApi.ts`

**Interfaces:**
- Consumes: los contratos de la Tarea 8.
- Produce, dentro del objeto que devuelve `useAdminApi`:
  - `getYoutubeChannels: () => Promise<YouTubeChannelInfo[]>`
  - `addYoutubeChannel: (input: { channelId: string; title: string; category: YoutubeChannelCategory }) => Promise<YouTubeChannelInfo>`
  - `removeYoutubeChannel: (channelId: string) => Promise<void>`
  - `resubscribeYoutubeChannel: (channelId: string) => Promise<YouTubeChannelInfo>`

- [ ] **Step 1: Agregar los tipos al import**

En el bloque de `import type { ... } from '@radio/types'` agregar `YouTubeChannelInfo`, `YouTubeChannelListResponse` y `YoutubeChannelCategory`.

- [ ] **Step 2: Agregar los cuatro callbacks**

Insertar despues de `getWorkerJobs` (linea 1109), siguiendo el mismo estilo:

```ts
  const getYoutubeChannels = useCallback(
    async () => (await request<YouTubeChannelListResponse>({ url: '/admin-api/youtube/channels' })).channels,
    [request]
  );

  const addYoutubeChannel = useCallback(
    (input: { channelId: string; title: string; category: YoutubeChannelCategory }) =>
      request<YouTubeChannelInfo>({
        method: 'POST',
        url: '/admin-api/youtube/channels',
        data: input,
      }),
    [request]
  );

  const removeYoutubeChannel = useCallback(
    (channelId: string) =>
      request<void>({
        method: 'DELETE',
        url: `/admin-api/youtube/channels/${encodeURIComponent(channelId)}`,
      }),
    [request]
  );

  const resubscribeYoutubeChannel = useCallback(
    (channelId: string) =>
      request<YouTubeChannelInfo>({
        method: 'POST',
        url: `/admin-api/youtube/channels/${encodeURIComponent(channelId)}/resubscribe`,
      }),
    [request]
  );
```

- [ ] **Step 3: Exportarlos**

Agregar los cuatro nombres al final del objeto retornado, junto a `getWorkerJobs,`.

- [ ] **Step 4: Compilar**

Run: `pnpm --filter @radio/web exec tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useAdminApi.ts
git commit -m "feat(web): add the youtube channel client calls"
```

---

### Task 10: La pagina

**Files:**
- Create: `apps/web/src/pages/admin/youtube/ChannelList.tsx`
- Create: `apps/web/src/pages/admin/youtube/WorkerDeployCard.tsx`
- Create: `apps/web/src/pages/admin/youtube/SilenceBar.tsx`
- Modify: `apps/web/src/pages/admin/AdminYouTube.tsx`

**Interfaces:**
- Consumes: los cuatro callbacks de la Tarea 9, `timeAgoShort` y `formatDateTime` de `apps/web/src/lib/format.ts`, los tipos de la Tarea 8.
- Produce: `<ChannelList />`, que recibe `onChanged?: () => void` para que la pagina refresque la lista de jobs cuando un canal entra o sale.
- `AdminYouTube.tsx` pasa de 760 lineas a menos de 560, con los bloques en este orden: canales, jobs, workers, despliegue.

**Interfaz visual, decidida yClosed** (spec seccion "Direccion visual"): sin colores nuevos, la pieza unica es una regla de 2 px cuyo relleno ambar mide el silencio del canal contra el mas callado de la lista, decorativa (`aria-hidden`) porque el texto "hace 6 d" lleva la misma informacion.

- [ ] **Step 1: Escribir `SilenceBar.tsx`**

```tsx
interface SilenceBarProps {
  /** 0 = the channel that spoke most recently, 1 = the quietest in the list. */
  ratio: number;
}

/**
 * The one expressive element on the page: an amber rule that empties as a channel
 * goes quiet, measured against the quietest channel in the same list. It is
 * decorative — the row's "hace 6 d" carries the same fact — so it is hidden from
 * assistive tech instead of being the only carrier of the signal.
 */
export default function SilenceBar({ ratio }: SilenceBarProps) {
  const fill = Math.round(Math.min(Math.max(ratio, 0), 1) * 100);

  return (
    <div aria-hidden className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border/60">
      <div
        className="h-full rounded-full bg-primary/70 motion-safe:animate-[bar-grow_600ms_ease-out]"
        style={{ width: `${fill}%`, animationName: 'bar-grow', transformOrigin: 'left' }}
      />
    </div>
  );
}
```

Definir la animacion `@keyframes bar-grow` en el `style` del componente con un `<style>{...}</style>`, para no tocar `apps/web/src/index.css`:

```
@keyframes bar-grow { from { transform: scaleX(0.2); opacity: 0.4; } to { transform: scaleX(1); opacity: 1; } }
```

Como el ancho ya viene calculado, la animacion solo hace `scaleX`, y el `motion-safe:` de Tailwind desactiva todo cuando el sistema pide menos movimiento.

- [ ] **Step 2: Escribir `ChannelList.tsx`**

Estructura y reglas exactas:

- Raiz `<section aria-labelledby="canales-heading">` con un `<h2 id="canales-heading" className="text-base font-semibold">Canales de YouTube</h2>` y un `<p className="text-sm text-muted-foreground">Cada canal que agregues se suscribe solo. Sus videos entran a la cola de procesamiento.</p>`.
- Formulario de alta: un solo `<form onSubmit>` con dos campos, `<input>` para el identificador con `placeholder="UCVqtYvLNHvGymJFoGeRH7nw o la URL del canal"`, `<input>` para el nombre con `placeholder="Radio Contrapunto - Noticias"`, y un `<select>` con `GENERAL` y `NEWS` etiquetados `Contenido general` y `Noticias`. El boton dice `Agregar canal`. Enter envia porque es un `<form>`.
- Estado del formulario: `useState` para los tres valores, `useState<string | null>` para el error, `useState<boolean>` para el envio. Nada global.
- El error se muestra debajo del campo del id, con `aria-describedby` en el input y `aria-invalid` cuando hay error.
- Lista: si no hay canales, un unico `<p className="py-8 text-center text-sm text-muted-foreground">Los canales que agregues aqui se suscriben automaticamente.</p>` y nada mas. Es una invitacion, no un mensaje de error.
- Cada fila: `<li>` con `flex flex-wrap items-baseline gap-x-3 gap-y-1`. Nombre en `text-sm font-medium text-foreground`, categoria en `<span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">`, tiempo relativo con `timeAgoShort(channel.lastNotifiedAt)` en `text-sm text-muted-foreground` alineado a la derecha con `ml-auto`, y dos botones de 44 px con `aria-label` que nombran el canal.
- Debajo del nombre, el id en `<span className="font-mono text-[11px] text-faint">{channel.channelId}</span>`.
- El `SilenceBar` va entre el nombre y el id, en ancho completo.
- `title` de la fila, en espanol y con el motivo, segun el estado: `subscribed` -> `"Suscripcion vigente hasta el <leaseExpiresAt>"`; `expiring` -> `"La suscripcion vence pronto y el proximo refresco la renueva"`; `failed` -> `channel.subscriptionError ?? "La ultima suscripcion fallo"`; `unverified` -> `"El feed todavia no se ha comprobado"`.
- Debajo de la fila, y solo si `feedEntryCount === 0`, un `<p className="text-xs text-warning">YouTube respondio pero su feed no trae videos: este canal no va a notificar por esta via.</p>`. Con `feedEntryCount === null` no se dice nada, porque no se sabe todavia.
- Los botones son un `<Button variant="ghost" size="icon">` con `RefreshCw` para re-susccribir y otro con `Trash2` para quitar. Ninguno borra sin confirmacion: el segundo pide confirmacion con un `<Dialog>` pequeño que dice `Quitar {title}?` y `Sus videos ya recibidos se conservan en el historial.`. Borrar un canal es la unica accion destructiva de la pagina y un clic de mas no deberia alcanzar al hub.
- `useEffect` con `setInterval(load, 30000)`, el mismo patron que el resto del panel. `load` usa `.then(onFulfilled, onRejected)` y no `try/catch`, porque react-hooks v7 marca el `setState` alcanzable desde funciones invocadas dentro de efectos.
- `onChanged` se llama despues de agregar y despues de quitar, para que la pagina refresque los jobs.

- [ ] **Step 3: Extraer la tarjeta de despliegue**

Mover sin cambios de comportamiento el bloque de `AdminYouTube.tsx` entre los comentarios `{/* ---- Rediseño: Artefacto de flota` y su cierre, junto con los imports que solo usa (`HardDrive`, `Upload`, `FileArchive`, `X`, `AlertCircle`, `PackageCheck`, `ShieldCheck`, `Zap`, `ChevronRight`, `formatBytes`, `Button`), a `apps/web/src/pages/admin/youtube/WorkerDeployCard.tsx`, exportado como `default`.

El bloque es autocontenido: sus `useState` y `useCallback` van con el. `validateAndSetFile`, `handleDragOver`, `handleDragLeave`, `handleDrop`, `handleFileInputChange`, `handleRemoveFile` y `handleUpload` pasan tal cual, sin renombrar.

- [ ] **Step 4: Reordenar y componer `AdminYouTube.tsx`**

Dejar el orden: canales, jobs, workers, despliegue. Sacar del archivo el bloque de despliegue y toda la zona que solo lo servia (`fileInputRef`, `releaseFile`, `dragActive`, `dragError`, `versionInput`, `mandatory`, `uploading`, `uploadError`, `uploadSuccess`, `formatBytes`, los siete `handle*` y los imports de `axios`, `useAdminAuth`, `API_BASE_URL`).

El encabezado conserva su copy actual y `onChanged` de `ChannelList` se pasa como `() => { void load(); }`.

- [ ] **Step 5: Compilar y construir**

Run: `pnpm --filter @radio/web exec tsc -b --noEmit`
Expected: PASS.

Run: `pnpm --filter @radio/web build`
Expected: PASS. Si el budget de bundle falla, el culpable esperado es el bloque de despliegue movido de archivo: no debe cambiar de tamano, porque `AdminYouTube.tsx` ya era lazy en `main.tsx` y sigue siendolo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/admin/AdminYouTube.tsx apps/web/src/pages/admin/youtube
git commit -m "feat(web): manage youtube channels from the panel"
```

---

### Task 11: Pruebas del panel

**Files:**
- Create: `apps/web/tests/youtube/panel-wiring.test.ts`

**Interfaces:**
- Consumes: los archivos de la Tarea 10 y los de las tareas 6 y 7.
- Produce: cuatro pruebas estaticas.

- [ ] **Step 1: Escribir el archivo**

```ts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const webSrc = join(repoRoot, "apps", "web", "src");

function read(...parts: string[]): string {
  return readFileSync(join(...parts), "utf8");
}

describe("youtube channels in the panel", () => {
  it("keeps the /admin/youtube entry under the youtube permission", () => {
    const layout = read(webSrc, "pages", "admin", "AdminLayout.tsx");
    expect(/to:\s*'\/admin\/youtube'[\s\S]{0,200}?permission:\s*'youtube'/.test(layout)).toBe(true);
  });

  it("calls the channel endpoints by name", () => {
    const api = read(webSrc, "hooks", "useAdminApi.ts");
    expect(api).toContain("/admin-api/youtube/channels");
    expect(api).toContain("/resubscribe");
    expect(api).toContain("encodeURIComponent(channelId)");
  });

  it("puts the channel block above the worker blocks", () => {
    const page = read(webSrc, "pages", "admin", "AdminYouTube.tsx");
    const channelsAt = page.indexOf("<ChannelList");
    const jobsAt = page.indexOf("Jobs de procesamiento");
    const workersAt = page.indexOf("Workers conectados");
    expect(channelsAt).toBeGreaterThan(-1);
    expect(channelsAt).toBeLessThan(jobsAt);
    expect(jobsAt).toBeLessThan(workersAt);
  });

  it("does not read the retired env vars anywhere in the panel or the backend", () => {
    const offenders = [
      join(repoRoot, "apps", "web", "src"),
      join(repoRoot, "backend", "src"),
    ].flatMap((dir) => walk(dir))
      .filter((file) => !file.endsWith("backfillYoutubeChannels.ts"))
      .filter((file) => /YOUTUBE_CHANNEL_IDS|YOUTUBE_CHANNEL_NOTICES/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});

function* walk(dir: string): Generator<string> {
  for (const entry of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}
```

Reemplazar el `require` por el `import { readdirSync } from "node:fs"` del encabezado: el archivo es ESM y vitest corre en modo ESM, asi que `require` no existe. Subir `readdirSync` al import de la linea 1 y borrar el `require` del final.

- [ ] **Step 2: Correr las pruebas**

Run: `pnpm --filter @radio/web test`
Expected: PASS, con las cuatro pruebas nuevas en verde y las existentes (`artwork`, `bumpers`, `perf`, `routing`) sin cambios.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/youtube
git commit -m "test(web): pin the youtube channel wiring"
```

---

### Task 12: Documentacion

**Files:**
- Modify: `docs/backend-context.md`
- Modify: `docs/frontend-context.md`

**Interfaces:**
- Produce: nada de codigo. Registra las decisiones que un lector futuro necesita y que no se deducen del fuente.

- [ ] **Step 1: Anotar el backend**

En `docs/backend-context.md`, agregar una seccion **Canales de YouTube (Oct 2026)** que registre, en este orden: la tabla `YouTubeChannel` es la fuente de verdad y `YouTubeSubscription` era un espejo que nadie leia; `category` reemplaza `YOUTUBE_CHANNEL_NOTICES` y decide `NOTICIAS` contra `CONTENIDO VARIADO` en los dos caminos de subida; la renovacion es un cron de 6 h contra un lease de 24 h y no un `setInterval`; borrar el canal borra la fila antes de avisar al hub; el webhook descarta notificaciones de canales no registrados; **y el feed publico de YouTube responde un stub vacio para cualquier `channel_id`, medido el 16 de octubre de 2026, asi que la ingesta no recibe nada por esta via**, con la decision de migrar a la YouTube Data API pendiente.

La ultima linea es la que mas importa: sin ella, dentro de seis meses el panel muestra cero notificaciones y nadie sabe si es un bug o es YouTube.

- [ ] **Step 2: Anotar el frontend**

En `docs/frontend-context.md`, agregar una subseccion bajo "Admin design system" que describa: el bloque de canales va arriba de todo en `/admin/youtube` porque es el origen de la cadena; la `SilenceBar` es el unico elemento expresivo de la pagina y es decorativa (`aria-hidden`), con el texto relativo haciendo el trabajo accesible; y la pagina se partio en `pages/admin/youtube/` porque `AdminYouTube.tsx` iba camino de 900 lineas.

- [ ] **Step 3: Commit**

```bash
git add docs/backend-context.md docs/frontend-context.md
git commit -m "docs: record the youtube channel registry decisions"
```

---

## Ejecucion

Son doce tareas que se tocan en cadena: el esquema primero, el servicio despues, el router despues, el panel al final. Ejecutar en orden, sin paralelizar tareas que tocen el mismo archivo.