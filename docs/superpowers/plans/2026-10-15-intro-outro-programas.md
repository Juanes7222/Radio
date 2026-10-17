# Intro y outro de programas especiales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada programa especial (prédicas, noticias, lectura) entre al aire con su intro y salga con su outro sin importar cuántos archivos suenen adentro, usando la playlist de AzuraCast como unidad.

**Architecture:** Una entidad nueva `PlaylistBumper` engancha un intro y un outro a una playlist de AzuraCast. Un servicio los fija como primera y última media de la playlist y, si `glued` es true, activa la opción `merge` de AzuraCast para que el bloque se emita fusionado en una sola pista. Un cron cada 5 minutos vuelve a fijar el orden porque la rotación y los workers reescriben la membresía de sus playlists.

**Tech Stack:** TypeScript, Express, Prisma (SQLite), AzuraCast AutoDJ API, React + Tailwind, vitest (solo `apps/web`).

**Spec:** `docs/superpowers/specs/2026-10-15-intro-outro-programas-design.md`

## Global Constraints

- TypeScript estricto en todas las capas. Nada de `any`; si es inevitable, aislarlo y explicarlo.
- `pnpm` es el gestor de paquetes. El backend vive en `backend/`, el panel en `apps/web/`, los contratos compartidos en `packages/types/`.
- Comentarios, JSDoc y nombres de código en inglés. Textos visibles al usuario, mensajes de validación y labels en español.
- **El backend no tiene runner de pruebas y no se debe añadir uno** (AGENTS.md: no inventar un framework de pruebas). La verificación de cada tarea de backend es `build` (que corre `prisma generate` + `tsc`) más el paso manual indicado. Donde un cambio amerita una prueba, la tarea lo deja escrito en la sección "Pruebas que deberían existir"; no se crea infraestructura para correrla.
- **Las pruebas del panel usan vitest y ya existen** (`apps/web/tests/`, script `pnpm --filter @radio/web test`). Las pruebas nuevas van ahí, no dentro de `src/`.
- El esquema de Prisma está partido por dominio en `backend/prisma/schema/*.prisma`; el archivo nuevo es `bumpers.prisma`.
- Las migraciones se generan con `pnpm --filter @radio/backend prisma:migrate`, que ya apunta a `prisma/schema`.
- Reutilizar el permiso `programs` ya existente. No se agrega una entrada a `AdminPermission`.
- Mensajes de error de la API en español, en el estilo de `AppError(400, "...")` de `backend/src/shared/errors/app-error.ts`.
- `interrupt` y `single_track` no son lo mismo: `single_track` es "seleccionar la playlist una sola vez en su franja" (`predicate.at_most(1, ...)` en AzuraCast), no "un solo ítem". El pegado pegado viene de `merge`.

## Review Focus

Cosas que el spec implica y que ninguna prueba cubrirá sola; cada una tiene su paso de verificación en la tarea que la posee.

1. Playlist con `source` distinto de `songs`: `merge` no se emite en AzuraCast, así que no hay pegado. Debe advertirse y no romper nada (Tarea 4).
2. La media del intro/outro borrada a mano en AzuraCast: la reconciliación debe re-subirla desde la copia local o reportarla como faltante, nunca dejar la playlist sin bumper en silencio (Tarea 4).
3. Cambio de `playlistId` en un bumper: hay que despegar los bumpers de la playlist anterior antes de enganchar la nueva, o la anterior queda fusionada para siempre (Tarea 4).
4. Playlist de la rotación reconstruida a las 03:30: si el cron no corre después, el intro y el outro desaparecen (Tarea 6).
5. Playlist compartida con la rotación general de música: fusionarla uniría toda la música del día. Debe rechazarse al crear (Tarea 4).

---

### Task 1: Verificación previa en AzuraCast

No hay banco de pruebas: la emisora es la real y en la máquina de desarrollo no hay AzuraCast configurado. Esta tarea se ejecuta contra la estación, fuera de horario, y su resultado decide un solo valor (`glued` por defecto).

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-intro-outro-programas-design.md` (sección "Verificación previa obligatoria")

**Interfaces:**
- Consumes: acceso a la API de AzuraCast de la estación y a su panel.
- Produces: el valor por defecto de `glued` que usan las Tareas 2 y 4, y las respuestas escritas en el spec.

- [ ] **Step 1: Crear una playlist desechable**

En AzuraCast, crear una playlist `ZZ PRUEBA BUMPERS` con `source: songs`, orden `sequential`, sin franja horaria. Subir tres archivos cortos (10 s) y dos archivos cortos con nombres `ZZ intro` y `ZZ outro`.

```bash
# Ids de la playlist y de las dos media, para poder borrarlos después
curl -s -H "Authorization: Bearer $AZURACAST_API_KEY" \
  "$AZURACAST_URL/api/station/$AZURACAST_STATION_ID/playlists" | grep -A2 "ZZ PRUEBA"
```

- [ ] **Step 2: Fijar intro primero, outro último, y activar las opciones**

Anotar en la playlist `[ZZ intro, audio1, audio2, audio3, ZZ outro]` en ese orden por peso.

```bash
curl -s -X PUT -H "Authorization: Bearer $AZURACAST_API_KEY" -H "Content-Type: application/json" \
  -d '{"order":"sequential","backend_options":["single_track","merge"]}' \
  "$AZURACAST_URL/api/station/$AZURACAST_STATION_ID/playlist/<PLAYLIST_ID>"
```

- [ ] **Step 3: Programar la playlist a 3 minutos y escuchar**

Ponerle una franja que arranque en 3 minutos y ampliar lo suficiente para oír el bloque completo. Escuchar el stream y anotar:

1. ¿Suena intro, los tres audios y el outro seguidos, en orden, como una sola pista continua?
2. ¿El crossfade de la estación se aplica entre las pistas fusionadas (se mezclan los bordes) o el corte es seco?
3. ¿"Sonando ahora" muestra una sola entrada, y con qué título?
4. Tras emitirse, ¿`GET /station/{id}/playlist/{id}/order` sigue listando `ZZ intro` y `ZZ outro` o desaparecieron?
5. Con la playlist alimentada por una **carpeta** de la biblioteca en vez de media sueltas, ¿el orden relativo entre la carpeta y las media fijadas es el esperado?

- [ ] **Step 4: Borrar la playlist y las media de prueba**

Confirmar que la estación volvió al estado previo antes de continuar.

- [ ] **Step 5: Escribir los resultados en el spec**

Reemplazar el contenido de la sección "Verificación previa obligatoria" por los hallazgos medidos, con la fecha. Si cualquiera de las respuestas 1, 3 o 4 contradice el supuesto, dejar escrito que **el valor por defecto de `glued` pasa a ser `false`** (bumpers como pistas separadas, el respaldo que el spec acepta) y que el pegado queda pendiente.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-10-15-intro-outro-programas-design.md
git commit -m "docs: record AzuraCast merge verification for program bumpers"
```

---

### Task 2: Modelo Prisma y migración

**Files:**
- Create: `backend/prisma/schema/bumpers.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_playlist_bumpers/migration.sql` (generado)
- Test: no aplica (sin runner en el backend)

**Interfaces:**
- Consumes: nada.
- Produces: el modelo `PlaylistBumper` y el delegate `prisma.playlistBumper` con los campos `id`, `label`, `playlistId`, `introMediaId`, `outroMediaId`, `introFile`, `outroFile`, `glued`, `priorBackendOptions`, `priorOrder`, `enabled`, `lastSyncedAt`, `createdAt`, `updatedAt`.

- [ ] **Step 1: Escribir el modelo**

`backend/prisma/schema/bumpers.prisma`:

```prisma
// Intro/outro pegados a la playlist de AzuraCast que emite un programa
// especial. AzuraCast hace el pegado: el backend solo fija el orden y, cuando
// `glued`, la opción `merge`.
model PlaylistBumper {
  id         String  @id @default(uuid())
  label      String
  // Playlist de AzuraCast que emite el programa. Una sola por playlist.
  playlistId Int     @unique @map("playlist_id")

  // unique_id de la media ya subida a la biblioteca de AzuraCast
  introMediaId String? @map("intro_media_id")
  outroMediaId String? @map("outro_media_id")
  // Copia local, para re-subir a AzuraCast si la media se borra allá
  introFile    String? @map("intro_file")
  outroFile    String? @map("outro_file")

  // true = pegar el bloque con `merge`; false = pistas separadas
  glued Boolean @default(true)

  // Estado previo de la playlist, para revertirlo al deshabilitar o borrar
  priorBackendOptions String? @map("prior_backend_options")
  priorOrder          String? @map("prior_order")

  enabled      Boolean   @default(true)
  lastSyncedAt DateTime? @map("last_synced_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("playlist_bumpers")
}
```

- [ ] **Step 2: Generar la migración y el cliente**

Run: `pnpm --filter @radio/backend prisma:migrate -- --name add_playlist_bumpers`
Expected: crea `backend/prisma/migrations/<timestamp>_add_playlist_bumpers/migration.sql`, lo aplica y corre `prisma generate` sin error.

- [ ] **Step 3: Verificar la migración generada**

Abrir el `migration.sql` y confirmar que crea `playlist_bumpers` con un `UNIQUE` sobre `playlist_id`. Confirmar también que aplica limpio sobre una copia de la base:

Run: `pnpm --filter @radio/backend prisma:migrate:status`
Expected: `Database schema is up to date!`

- [ ] **Step 4: Verificar que el tipo existe**

Añadir temporalmente una línea que use `prisma.playlistBumper.count()` en `backend/src/index.ts`, correr `pnpm --filter @radio/backend build`, confirmar que compila, y borrar la línea.

Expected: compila; el delegate existe.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema/bumpers.prisma backend/prisma/migrations
git commit -m "feat(db): add playlist_bumpers table"
```

---

### Task 3: Servicio AzuraCast de bumpers

**Files:**
- Create: `backend/src/modules/bumpers/bumper.constants.ts`
- Create: `backend/src/modules/bumpers/bumper.azuracast.service.ts`
- Modify: `backend/src/modules/rotation/azuracastPlaylist.service.ts` (agregar `backend_options` a `PlaylistDetail`)

**Interfaces:**
- Consumes: `getPlaylistOrder`, `setPlaylistOrder`, `getPlaylistDetail`, `updatePlaylist`, `setFilePlaylists`, `getFileDetail`, `readPlaylistForBumper` usa `PlaylistOrderEntry` (todos de `../rotation/azuracastPlaylist.service`).
- Produces, para la Tarea 4:
  - `BUMPER_ASSET_KINDS: readonly ["intro", "outro"]` y `type BumperAssetKind`.
  - `BUMPER_PERMISSION = "programs"`.
  - `BUMPER_LIBRARY_FOLDER = "BUMPERS"`.
  - `computeReorder(entries: PlaylistOrderEntry[], introUniqueId: string | null, outroUniqueId: string | null): Record<number, number>`
  - `readPlaylistForBumper(playlistId: number): Promise<{ name: string; source: string; order: string; backendOptions: string[]; hasSchedule: boolean }>`
  - `pinBumperMedia(playlistId: number, mediaUniqueId: string, position: "first" | "last"): Promise<void>`
  - `applyBumperOptions(playlistId: number, glued: boolean): Promise<void>`
  - `restorePlaylistOptions(playlistId: number, previousBackendOptions: string, previousOrder: string): Promise<void>`
  - `unbindBumperMedia(playlistId: number, mediaUniqueId: string): Promise<void>`

- [ ] **Step 1: Extender `PlaylistDetail`**

En `backend/src/modules/rotation/azuracastPlaylist.service.ts`, agregar el campo a la interfaz, sin tocar el resto:

```ts
export interface PlaylistDetail {
  id: number;
  name: string;
  type?: string;
  source: string;
  order: string;
  is_enabled?: boolean;
  schedule_items?: PlaylistScheduleItem[];
  /** Opciones de backend de AzuraCast: 'interrupt', 'single_track', 'merge'. */
  backend_options?: string[];
}
```

Run: `pnpm --filter @radio/backend build`
Expected: compila.

- [ ] **Step 2: Escribir el módulo puro de reordenamiento**

En `backend/src/modules/bumpers/bumper.azuracast.service.ts`, `computeReorder` toma las filas tal como las devuelve AzuraCast y devuelve el mapa `rowId -> peso` con el intro primero y el outro último, conservando el orden relativo del resto. Reglas exactas:

- El intro (cuando `introUniqueId` coincide con el `unique_id` de una fila) recibe peso 1.
- El outro recibe el último peso.
- Las filas intermedias conservan su orden actual.
- Si `introUniqueId === outroUniqueId` y ambos están presentes, la fila va al final y no se duplica.
- Una fila ausente del mapa no se toca.

- [ ] **Step 3: Verificar `computeReorder` a mano**

Run: `pnpm --filter @radio/backend build`
Expected: compila.

Después, con `pnpm --filter @radio/backend exec ts-node -e "..."`, ejecutar los tres casos: (a) lista `[intro, a, b, outro]` ya ordenada devuelve los mismos pesos; (b) `[a, b, intro, outro]` devuelve intro=1, a=2, b=3, outro=4; (c) sin intro devuelve solo el outro al final. Anotar el resultado.

**Pruebas que deberían existir:** cuando el backend tenga runner, `computeReorder` es una función pura y debería cubrirse con una prueba por cada una de las tres ramas anteriores más el caso `introUniqueId === outroUniqueId`.

- [ ] **Step 4: Escribir las funciones de AzuraCast**

- `readPlaylistForBumper` usa `getPlaylistDetail` y devuelve `source`, `order`, `backendOptions` (`detail.backend_options ?? []`), `name` y `hasSchedule` (`(detail.schedule_items ?? []).length > 0`).
- `pinBumperMedia` lee la membresía con `getFileDetail(mediaUniqueId).playlists`, agrega el `playlistId` si falta con `setFilePlaylists(mediaUniqueId, ids)`, lee `getPlaylistOrder(playlistId)` y aplica `setPlaylistOrder(playlistId, computeReorder(...))`. Para ubicar el otro extremo pasa el `unique_id` del bumper que ya esté en la lista; si no hay ninguno, el parámetro opuesto va en null.
- `applyBumperOptions` combina las opciones conservando las que ya estaban y sin duplicar: siempre agrega `single_track`; agrega `merge` cuando `glued` y lo quita cuando no. Envía `{ order: "sequential", backend_options }` con `updatePlaylist`.
- `restorePlaylistOptions` vuelve a enviar `backend_options` (parseando la cadena separada por comas; cadena vacía significa lista vacía) y `order` con los valores previos.
- `unbindBumperMedia` relee `getFileDetail(mediaUniqueId).playlists`, filtra el `playlistId` y llama `setFilePlaylists` con el resto.

`backend_options` se guarda en la base como cadena separada por comas, por eso la firma de `restorePlaylistOptions` recibe `string`.

- [ ] **Step 5: Verificar contra AzuraCast**

Sobre la misma playlist desechable de la Tarea 1 (recrearla si se borró), correr cada función por separado con `ts-node -e` y confirmar con `GET /station/{id}/playlist/{id}/order` y `GET /station/{id}/playlist/{id}` que el orden y `backend_options` quedan como se espera. Confirmar también que `unbindBumperMedia` deja de listar la media sin tocar las demás.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/bumpers backend/src/modules/rotation/azuracastPlaylist.service.ts
git commit -m "feat(bumpers): pin intro/outro in an AzuraCast playlist"
```

---

### Task 4: Servicio de datos y reconciliación

**Files:**
- Create: `backend/src/config/bumpers.config.ts`
- Modify: `backend/src/config/index.ts`
- Create: `backend/src/modules/bumpers/bumper.service.ts`
- Modify: `packages/types/src/admin.ts`

**Interfaces:**
- Consumes: todo lo producido por la Tarea 3; `prisma.playlistBumper`; `Program` (`prisma.program.findFirst({ where: { playlistId } })`); `uploadFileToStation(uploadPath, base64File, playlistId?)` de `../azuracast/upload.service`; `ensureMediaDirectory` y `parentDirectory` de `../rotation/azuracastPlaylist.service`; `resolveStorageDir`, `ensureDir`, `getMediaFilePath`, `writeMediaFile`, `deleteMediaFileIfExists` de `../../shared/storage/localStorage`; `AppError`; `logger`.
- Produces, para las Tareas 5 y 7:
  - `type ReconcileResult = { id: string; label: string; warnings: string[]; pinnedIntro: boolean; pinnedOutro: boolean }`
  - `listBumpers(): Promise<PlaylistBumper[]>`
  - `createBumper(input: { label: string; playlistId: number; glued?: boolean }): Promise<PlaylistBumper>`
  - `updateBumper(id: string, input: { label?: string; enabled?: boolean; glued?: boolean }): Promise<PlaylistBumper>`
  - `deleteBumper(id: string): Promise<void>`
  - `setBumperAsset(id: string, kind: BumperAssetKind, localFilePath: string, originalName: string): Promise<PlaylistBumper>`
  - `clearBumperAsset(id: string, kind: BumperAssetKind): Promise<PlaylistBumper>`
  - `reconcileBumper(id: string): Promise<ReconcileResult>`
  - `reconcileAllBumpers(): Promise<ReconcileResult[]>`
  - El DTO `PlaylistBumper` exportado desde `@radio/types`.

- [ ] **Step 1: Config y agregación**

`backend/src/config/bumpers.config.ts`, siguiendo la forma de `programs.config.ts`:

```ts
import { envOr } from "./env";

export const bumpersConfig = {
  /** Carpeta local con las copias de intro/outro, relativa al árbol de storage. */
  assetDir: envOr("BUMPERS_ASSET_DIR", "program-bumpers"),
  /** Minutos entre corridas de reconciliación. */
  syncCron: envOr("BUMPERS_SYNC_CRON", "*/5 * * * *"),
};
```

En `backend/src/config/index.ts`, importar y exponer `bumpers: bumpersConfig` junto a `programs`.

- [ ] **Step 2: Tipos compartidos**

En `packages/types/src/admin.ts`, agregar el DTO. Se exporta solo por estar en `admin.ts`, que ya lo está en `packages/types/src/index.ts`:

```ts
/** Intro/outro fijados a la playlist de AzuraCast de un programa especial. */
export interface PlaylistBumper {
  id: string;
  label: string;
  playlistId: number;
  playlistName: string | null;
  /** Advertencia legible cuando la playlist no admite el bumper tal cual. */
  warning: string | null;
  hasIntro: boolean;
  hasOutro: boolean;
  glued: boolean;
  enabled: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Escribir los CRUD**

En `backend/src/modules/bumpers/bumper.service.ts`, `toBumperDto` serializa las fechas con `.toISOString()` como `toProgramDto`, y resuelve `playlistName` y `warning` con `readPlaylistForBumper`, devolviendo `warning` con el motivo cuando `source !== "songs"` o cuando `hasSchedule` es false.

`createBumper` valida en este orden y lanza `AppError(409, ...)` con el motivo:

1. La playlist no existe en AzuraCast.
2. `prisma.program.findFirst({ where: { playlistId } })` existe: ya la maneja un `Program`, y sus episodios ya van pegados con ffmpeg.
3. Ya hay un `PlaylistBumper` con ese `playlistId`.
4. La playlist no tiene franja horaria: advierte pero no bloquea (guarda y devuelve `warning`).

`updateBumper` revierte la playlist antes de aplicar el cambio cuando el `playlistId` cambia: restaura el estado previo guardado, despega la media del bumper, y luego engancha en la nueva playlist destino. Cuando `glued` cambia con la playlist quieta, vuelve a aplicar `applyBumperOptions`.

`deleteBumper` restaura el estado previo, despega intro y outro de la playlist, borra las copias locales y la fila.

- [ ] **Step 4: Escribir la subida de assets**

`setBumperAsset(id, kind, localFilePath, originalName)`: guarda la copia local en `resolveStorageDir(config.bumpers.assetDir)` con un nombre derivado del `slugify(label)` y el `kind` (por ejemplo `predicas-intro.mp3`), la sube con `uploadFileToStation(`${config.programs.rootFolder}/${BUMPER_LIBRARY_FOLDER}/${name}`, base64, undefined)` tras `ensureMediaDirectory`, y guarda el `unique_id` devuelto en `introMediaId` u `outroMediaId`. Al final llama `reconcileBumper(id)`.

`clearBumperAsset` despega la media de la playlist, borra la copia local y limpia la columna.

- [ ] **Step 5: Escribir la reconciliación**

`reconcileBumper(id)`:

1. Si el bumper no existe, lanza `AppError(404, ...)`; si `enabled` es false, devuelve `{ id, label, pinnedIntro: false, pinnedOutro: false, warnings: [] }` sin tocar AzuraCast.
2. Lee la playlist. Si `source !== "songs"`, devuelve la advertencia del Review Focus 1 y no toca nada más.
3. Si falta alguna de las dos media en AzuraCast (`getFileDetail` falla con 404) y hay copia local, la vuelve a subir; si no hay copia local, agrega la advertencia `Falta el archivo del intro (o del outro) y no hay copia local para re-subirlo.` y continúa con el otro extremo.
4. Llama `pinBumperMedia` para el intro (si hay) y para el outro (si hay), y luego `applyBumperOptions(playlistId, glued)`.
5. Actualiza `lastSyncedAt` y devuelve el resultado con las advertencias acumuladas.

`reconcileAllBumpers()` corre `reconcileBumper` sobre todas las filas con `enabled: true`, atrapando el error de cada una para que una playlist rota no detenga las demás, y registra con `logger.warn("Bumpers", ...)` cada advertencia.

- [ ] **Step 6: Verificar las cinco condiciones del Review Focus**

Run: `pnpm --filter @radio/backend build`
Expected: compila.

Luego, con una playlist desechable y las funciones por `ts-node -e`:

1. Una playlist con `source: "playlists"` devuelve advertencia y no modifica `backend_options`.
2. Borrar la media del intro en AzuraCast y correr `reconcileBumper`: la re-sube desde la copia local. Repetir borrando también la copia local: la advertencia aparece y el outro sigue funcionando.
3. Mover el bumper a otra playlist: la anterior queda con su `backend_options` y `order` originales, sin la media del bumper.
4. `createBumper` sobre la playlist de la rotación general devuelve 409.
5. `createBumper` sobre la playlist de un `Program` devuelve 409.

- [ ] **Step 7: Commit**

```bash
git add backend/src/config backend/src/modules/bumpers packages/types/src/admin.ts
git commit -m "feat(bumpers): reconcile intro/outro on the target playlist"
```

---

### Task 5: Rutas admin y montaje

**Files:**
- Create: `backend/src/modules/bumpers/bumper.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: el servicio de la Tarea 4, `requireAuth`/`requirePermission` de `../auth/auth.middleware`, `BUMPER_PERMISSION`, `PROGRAM_AUDIO_MIME_TYPES` y `PROGRAM_ASSET_MAX_BYTES` de `../programs/program.constants`, `asyncHandler` y `AppError`.
- Produces: el router montado en `/admin-api/bumpers`.

- [ ] **Step 1: Escribir el router**

`router.use(requireAuth, requirePermission(BUMPER_PERMISSION))` y los endpoints del spec:

| Método y ruta | Cuerpo | Devuelve |
|---|---|---|
| `GET /` | — | `{ bumpers: PlaylistBumper[] }` |
| `POST /` | `{ label, playlistId, glued? }` | 201 con el bumper |
| `PUT /:id` | `{ label?, enabled?, glued? }` | el bumper |
| `DELETE /:id` | — | 204 |
| `POST /:id/assets/:kind` | `audio` (multipart) | el bumper |
| `DELETE /:id/assets/:kind` | — | el bumper |
| `POST /:id/reconcile` | — | `{ result }` |

El multipart usa el mismo `multer.diskStorage` que `program.routes.ts` (carpeta temporal del sistema, límite `PROGRAM_ASSET_MAX_BYTES`, filtro por `PROGRAM_AUDIO_MIME_TYPES`), y borra el temporal en un `finally`. `:kind` se valida contra `BUMPER_ASSET_KINDS` y devuelve 400 si no coincide. Un body inválido (label vacío, `playlistId` no entero) devuelve 400. Un conflicto de creación devuelve el 409 que ya lanza el servicio.

- [ ] **Step 2: Montar en la app**

En `backend/src/app.ts`, junto a la línea 150:
```ts
app.use("/admin-api/bumpers", bumpersRouter);
```
No va en `SILENT_LOG_PATHS`: el panel no lo consulta por sondeo.

- [ ] **Step 3: Verificar con el servidor levantado**

Run: `pnpm --filter @radio/backend dev`

En otra terminal, con un token de admin válido:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"label":"Prueba","playlistId":<PLAYLIST_ID>}' http://localhost:3001/admin-api/bumpers
```

Expected: 201 con el bumper y `warning` no nulo si la playlist no tiene franja.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/admin-api/bumpers
```

Expected: `{ "bumpers": [ ... ] }`. Confirmar también que un POST sin token responde 401 y que un `kind` inválido responde 400.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/bumpers/bumper.routes.ts backend/src/app.ts
git commit -m "feat(bumpers): expose admin endpoints"
```

---

### Task 6: Cron de reconciliación y registro

**Files:**
- Create: `backend/src/modules/bumpers/bumper.job.ts`
- Modify: `backend/src/jobs/scheduler.ts`
- Modify: `backend/src/modules/systemJobs/systemJobs.registry.ts`

**Interfaces:**
- Consumes: `reconcileAllBumpers` de la Tarea 4, `config.bumpers.syncCron`, `config.locutor.timezone`.
- Produces: `registerBumperJob(): void` y la clave de job `"bumpers-reconcile"`.

- [ ] **Step 1: Escribir el job**

`backend/src/modules/bumpers/bumper.job.ts` con la forma exacta de `program.playback.job.ts`: `cron.schedule(config.bumpers.syncCron, () => { reconcileAllBumpers().then(...).catch(...) }, { timezone: config.locutor.timezone })`, y solo registra `logger.info` cuando hay advertencias.

- [ ] **Step 2: Registrar en el scheduler**

En `backend/src/jobs/scheduler.ts`: importar `registerBumperJob`, llamarlo después de `registerRotationJob()` (la rotación corre a las 03:30 y la reconciliación tiene que correr después), y sumar "Bumpers Reconcile (every 5 min)" al texto del `logger.info` final.

- [ ] **Step 3: Registrar la corrida manual**

En `backend/src/modules/systemJobs/systemJobs.registry.ts`: agregar `"bumpers-reconcile"` al `SystemJobKey`, la entrada al `SYSTEM_JOB_CATALOG` con `label: "Reconciliar intro y outro"`, `description: "Vuelve a fijar el intro y el outro de cada programa en su playlist de AzuraCast."`, `schedule: "cada 5 min"`, `requiresConfirm: false`, y la línea en `SYSTEM_JOB_RUNNERS`.

- [ ] **Step 4: Verificar el orden rotación → reconciliación**

Run: `pnpm --filter @radio/backend build`
Expected: compila.

Levantar el backend, confirmar en la bitácora la línea del scheduler con el job nuevo, y ejecutar la corrida manual desde el panel de Jobs (`POST /admin-api/jobs/bumpers-reconcile/run`) sobre un bumper de prueba. Después de correr la rotación de prueba (`POST /admin-api/jobs/rotations/run`) sobre una playlist de lectura con bumper, confirmar con `GET /station/{id}/playlist/{id}/order` que el intro y el outro volvieron a quedar primero y último.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/bumpers/bumper.job.ts backend/src/jobs/scheduler.ts backend/src/modules/systemJobs/systemJobs.registry.ts
git commit -m "feat(bumpers): re-pin bumpers every five minutes"
```

---

### Task 7: Panel de administración

**Files:**
- Modify: `apps/web/src/hooks/useAdminApi.ts`
- Create: `apps/web/src/pages/admin/AdminBumpers.tsx`
- Modify: `apps/web/src/pages/admin/index.ts`
- Modify: `apps/web/src/pages/admin/AdminLayout.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/tests/bumpers/nav-entry.test.ts`

**Interfaces:**
- Consumes: `PlaylistBumper` de `@radio/types`, el helper `request<T>` interno de `useAdminApi`.
- Produces: los métodos `listBumpers`, `createBumper`, `updateBumper`, `deleteBumper`, `uploadBumperAsset`, `clearBumperAsset`, `reconcileBumper`.

- [ ] **Step 1: Escribir la prueba que falla**

`apps/web/tests/bumpers/nav-entry.test.ts`, siguiendo la forma de `apps/web/tests/perf/static-assets.test.ts` (leer el archivo y afirmar sobre su contenido):

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

describe("bumpers panel entry", () => {
  it("registers /admin/bumpers under the programs permission", () => {
    const layout = readFileSync(join(srcRoot, "pages", "admin", "AdminLayout.tsx"), "utf8");
    const entry = /to:\s*'\/admin\/bumpers'[\s\S]{0,200}?permission:\s*'programs'/.exec(layout);
    expect(entry).not.toBeNull();
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `pnpm --filter @radio/web test -- bumpers`
Expected: FAIL, la entrada todavía no existe.

- [ ] **Step 3: Escribir los métodos del hook**

En `apps/web/src/hooks/useAdminApi.ts`, agregar los siete métodos con `useCallback` y el helper `request<T>` existente, siguiendo la forma de `getReadingHistory`. `uploadBumperAsset` arma un `FormData` con la clave `audio`. Todos entran en el objeto que devuelve el hook, junto a `getReadingHistory` (línea 1291).

- [ ] **Step 4: Escribir la página**

`apps/web/src/pages/admin/AdminBumpers.tsx`: lista de bumpers con `label`, nombre de la playlist, estado de intro/outro, `warning` en color `destructive`, y acciones (habilitar/deshabilitar, subir intro, subir outro, reconciliar, eliminar). Estados de carga, vacío y error explícitos, como el resto del panel. El `Select` de playlist se llena desde el listado de playlists de AzuraCast que ya consume el panel. Textos en español.

- [ ] **Step 5: Registrar ruta y navegación**

- `apps/web/src/pages/admin/index.ts`: exportar el componente.
- `apps/web/src/main.tsx`: agregar la ruta `/admin/bumpers` entre las del panel.
- `apps/web/src/pages/admin/AdminLayout.tsx`: agregar la entrada en la sección Contenido, junto a `programs` y `rotations`:
  `{ to: '/admin/bumpers', label: 'Intro y outro', icon: Radio, permission: 'programs' }`

- [ ] **Step 6: Correr la prueba y ver que pasa**

Run: `pnpm --filter @radio/web test -- bumpers`
Expected: PASS.

- [ ] **Step 7: Verificar el panel a mano**

Run: `pnpm --filter @radio/web dev`
Expected: la entrada aparece para un admin, la ruta abre, el listado carga y subir un intro devuelve el bumper actualizado.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/hooks/useAdminApi.ts apps/web/src/pages/admin apps/web/src/main.tsx apps/web/tests/bumpers
git commit -m "feat(web): add intro/outro admin panel"
```

---

## Pruebas que deberían existir (backend)

El backend no tiene runner y este plan no lo introduce. Cuando lo tenga, lo que amerita prueba:

- `computeReorder`: las tres ramas del reordenamiento más el caso `introUniqueId === outroUniqueId` (Tarea 3).
- `createBumper`: los cuatro rechazos y aceptaciones de la Tarea 4, contra un doble del servicio de AzuraCast.
- `reconcileBumper`: playlist no `songs` (advertencia y no toca), media ausente con y sin copia local, y `enabled: false` (no toca AzuraCast).
- `restorePlaylistOptions`: reconstruye `backend_options` desde la cadena separada por comas, incluida la cadena vacía.
