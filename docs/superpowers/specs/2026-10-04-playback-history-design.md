# Historial detallado de reproducción

Fecha: 2026-10-04

## Objetivo

Una sección nueva en el panel admin donde se vea qué audio sonó, a qué hora y qué día,
cuántas veces se reprodujo cada audio dentro de un período, y con filtros de fecha,
playlist, texto y peticiones.

Hoy no existe nada de esto. No hay contador de reproducciones por audio en ninguna
capa, ni tabla que registre qué canción sonó. `RotationRunLog` registra la
*construcción* de playlists, no lo que se emitió; `AudioSchedule.playedAt` solo marca
las locuciones TTS.

## Fuente de datos

`GET /station/{id}/history?start=&end=` de AzuraCast. El backend ya lo consume en
`backend/src/modules/azuracast/cleanup/folderCleanup.service.ts:80-89`, pero solo
extrae `song.id` y descarta el resto del registro, incluido `played_at`.

El tipo `SongHistory` ya existe en `packages/types/src/azuracast.ts:87-95` con
`sh_id`, `played_at`, `duration`, `playlist`, `streamer`, `is_request` y `song`.
No hace falta tipar nada nuevo del lado de AzuraCast.

Se descarta la alternativa de leer el contador `num_play` de los archivos de la
estación: no tiene marca de tiempo, así que no puede responder "a qué hora y qué
día", y obliga a barrer la biblioteca de 15 000 archivos.

## Modelo de datos

Archivo nuevo `backend/prisma/schema/playback.prisma`:

```prisma
model PlaybackEvent {
  id            String   @id @default(uuid())
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
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("playback_events")
  @@index([playedAt])
  @@index([songId])
}
```

Tres decisiones, todas con medición detrás (ver "Rendimiento"):

1. **Título, artista y álbum se copian a la fila.** Es lo que evita que el historial
   toque la biblioteca de AzuraCast. `listAllStationFiles` ya obliga a cachear 10
   minutos porque barre hasta 30 páginas de 500 archivos
   (`rotation/azuracastPlaylist.service.ts:83-113`); el historial no paga ese costo
   nunca.

2. **Dos índices: `(playedAt)` y `(songId)`.** Ninguno de los dos ayuda al
   `GROUP BY`: con la condición `WHERE played_at BETWEEN` el planificador elige
   siempre el índice de `played_at` y termina en `USE TEMP B-TREE FOR GROUP BY`. El de
   `song_id` se justifies por otra cosa: la vista por audio agrupa por `songId` y
   después resuelve título, artista y álbum de los audios de la página, y eso sin
   índice es un escaneo completo (41 ms medidos para 20 audios, 1,75 ms con índice).

3. **`azuracastShId` es la clave de idempotencia.** Permite ventanas de consulta
   solapadas entre corridas: el job pide `[max(playedAt) - 10 min, ahora]`. Un poll
   perdido, un reinicio o una caída de tres días no pierden eventos ni duplican, y
   no hace falta guardar un cursor de estado en ningún lado.

No se guarda la ruta del archivo: el objeto `song` de AzuraCast no la trae, y obtenerla
exigiría volver a la biblioteca.

## Recolección

Módulo nuevo `backend/src/modules/playback/`.

`playback.service.ts` expone `capturePlaybackHistory()`, siguiendo la forma de
`listenerHistory.service.ts:18-38`:

1. Lee `MAX(played_at)` de la tabla (0,03 ms medidos).
2. Si la tabla está vacía, hace *backfill* por días desde hace 90 días, 30 días por
   corrida como máximo. Sin esto la página estaría vacía durante 90 días.
3. Si no, consulta la ventana `[max - 10 min, ahora]`.
4. Mapea los registros a filas y las inserta.

**El insert idempotente.** Prisma 6.19.3 sobre SQLite no soporta `skipDuplicates`: no
aparece en el cliente generado que consume la app
(`node_modules/.prisma/client/index.d.ts`, cero apariciones) y `BibleBookCreateManyArgs`
solo declara `data`. El patrón es un `findMany` de los `sh_id` del lote más un
`createMany` de los que faltan, con un guard in-process que serializa corridas
solapadas — el mismo patrón que el in-flight dedup de `bibleSource.service.ts:223-275`.
Si aun así colara un `P2002`, la ventana solapada del siguiente tick lo resuelve.

**Por qué lotes de un día y no fila por fila.** Medido: 3,3 ms por fila contra
3,4 ms por lote de 3, 25 ms por lote de 480 y 19 000–30 000 filas/s en lote grande. El
fsync por commit en WAL domina. Los 90 días de *backfill* cuestan 68 s fila por fila y
2,3 s con lotes de un día.

**Poda.** La misma corrida borra lo anterior a 90 días, igual que
`SNAPSHOT_RETENTION_DAYS` en `listenerHistory.service.ts:5,34-37`.

`playback.job.ts` la registra en el scheduler con cron `*/5 * * * *` y timezone
`config.locutor.timezone`, copiando `listenerHistory.job.ts:10-23`. La frecuencia no
afecta la completitud: la ventana se solapa y el insert es idempotente, así que subir
a 10 minutos no perdería eventos.

`systemJobs.registry.ts` la registra en los tres lugares obligatorios (unión
`SystemJobKey`, `SYSTEM_JOB_CATALOG` con `schedule: "cada 5 min"` y
`requiresConfirm: false`, y `SYSTEM_JOB_RUNNERS`).

## API

Montada en `app.use("/admin-api/playback", playbackRouter)` con `requireAuth` y
`requirePermission("dashboard")`, reutilizando un permiso existente para no obligar a
reasignar permisos a los admins actuales.

Las fechas viajan como `YYYY-MM-DD` y se interpretan en la zona de la estación, con
`getStationDayStartWithOffset` de `shared/utils/date.ts:157`, que ya resuelve el
offset de Bogotá. `to` incluye el día completo. Ventana por defecto: 30 días. Tope
duro: 90 días, alineado con la retención. Una ventana más ancha, un `from` posterior
al `to` o una fecha mal formada se rechazan con 400 en vez de degradarse en silencio.

`limit` es 20 por defecto y 50 como máximo, igual que en `prayer.routes.ts:33-37`.
`playlist` es coincidencia exacta sobre el nombre de playlist de AzuraCast.
`requests` es `"1"` para ocultar las transmisiones de DJ, `"0"` o ausente para
mostrarlas todas. `search` busca con `contains` sobre título y artista.

| Endpoint | Query | Respuesta |
|---|---|---|
| `GET /playback/log` | `from,to,playlist,search,requests,page,limit` | `{ rows, total, page, totalPages }` |
| `GET /playback/audios` | `from,to,playlist,search,page,limit,order` | `{ rows, total, page, totalPages }` |
| `GET /playback/filters` | — | `{ playlists: string[] }` |

`rows` del log: `{ shId, playedAt, durationSec, songId, title, artist, album,
playlist, streamer, isRequest }`.
`rows` de audios: `{ songId, title, artist, album, plays, firstPlayedAt,
lastPlayedAt }`.

`order` acepta `plays` (default), `recent` y `first`.

La vista por audio agrupa **solo por `songId`**, y en una segunda consulta resuelve
título, artista y álbum de los audios de la página, tomando el registro más reciente
de cada uno. Agrupar por `songId, title, artist, album` partido el contador de un
audio en varios grupos si su metadata se editó en AzuraCast dentro de la ventana, y el
`song.id` de AzuraCast no cambia al editar metadata. Esa segunda consulta es la razón
del índice sobre `songId`: 41 ms sin él, 1,75 ms con él.

`/filters` va aparte y no se recalcula en cada carga de página: la lista de playlists
medida cuesta 17–29 ms por request, puro trabajo para llenar un dropdown. Se cachea
en memoria 10 minutos, porque las rotaciones se configuran a las 03:30 y esa lista
cambia pocas veces al día.

El contrato `{ rows, total, page, totalPages }` es el de la casa
(`prayer.routes.ts:195-202`, `AdminDeviceList` en `packages/types/src/admin.ts:395-400`).

## Rendimiento

Medido sobre SQLite con el esquema real, tres perfiles de 90 días (tracks de 4,6 min
con 2 500 audios distintos; tracks de 3 min con 2 500; y tracks de 3 min con 8 000),
con `EXPLAIN QUERY PLAN` y p50/p95 sobre 20 corridas.

| operación | 30 días | 90 días |
|---|---|---|
| log, página 1 | 0,12 ms | 0,12 ms |
| log, página 250 (offset 4980) | 0,50 ms | 0,93 ms |
| `COUNT(*)` del log | ~0,7 ms | 2,2 ms |
| `GROUP BY song_id`, top 20 | 11,8 ms | 48,9–58,2 ms |
| `COUNT(DISTINCT song_id)` | ~8 ms | 34–40 ms |
| `DISTINCT playlist` | 3,2 ms | 17–29 ms |
| metadatos de 20 audios | — | 1,75 ms (41 ms sin índice) |
| búsqueda `LIKE` sin coincidencias | ~15 ms | 39 ms (p95 94 ms) |

Carga por página del admin: log ~2 ms; vista por audio ~20 ms a 30 días, ~90 ms
p50 / ~120 ms p95 a 90 días. Un solo hilo, y solo si un admin navega muchas páginas
por minuto. Ninguna de estas consultas es un cuello de botella.

**El `GROUP BY` crece linealmente con la ventana.** Esa es la frontera del diseño: si
algún día se quiere más de 90 días, esa vista pasa a cientos de ms y haría falta una
tabla pre-agregada. Con la retención actual no.

**Búsqueda de texto.** `LIKE '%x%'` no usa índice; en el peor caso escanea la
ventana. Se limita a 200 caracteres como ya hace `logs.routes.ts:63` y no se
construye FTS: a este volumen no se justifica.

**Escritura.** 3,4 ms por commit el poll de 5 minutos; 2,3 s el backfill completo
una sola vez. **No se toca `PRAGMA synchronous`**: es un cambio global que afecta la
durabilidad de usuarios, peticiones de oración y demás, y no hace falta.

**Bloqueo.** WAL permite un escritor y N lectores. El poll escribe 3,4 ms cada 5
minutos y el backfill corta el lock de escritura en rebanadas de 25 ms. Ninguna
lectura de la API se bloquea.

**Espacio.** 34 000 filas ocupan 5,5 MB con los dos índices; la base pasa de 0,48 MB
a ~6 MB. Acotado por la retención, así que no crece más allá. Normalizar
título/artista en una tabla de dimensión lo reduciría, pero reintroduce un JOIN en el
camino caliente y no vale ese ahorro.

## Panel

Página nueva `apps/web/src/pages/admin/AdminPlaybackHistory.tsx` con dos pestañas
sobre el mismo filtro:

- **Log**: una fila por reproducción, con fecha y hora, título, artista, playlist y
  un distintivo si fue una petición o una transmisión de DJ.
- **Por audio**: una fila por audio con total de reproducciones, primera y última
  vez, ordenable.

Filtros compartidos: rango de fechas (presets de 7/30/90 días más fechas a mano),
playlist, búsqueda con *debounce*, y un interruptor de solo peticiones.

Sigue las convenciones existentes: `.then` en vez de `async` en efectos (react-hooks
v7), `AdminPagination` para la paginación, `viewKey` para recargar al cambiar de
pestaña, y estados explícitos de carga, vacío y error.

### Integración

| Archivo | Cambio |
|---|---|
| `packages/types/src/admin.ts` | `PlaybackEventRow`, `PlaybackEventList`, `PlaybackAudioRow`, `PlaybackAudioList`, `PlaybackFilters` |
| `apps/web/src/hooks/useAdminApi.ts` | `getPlaybackLog`, `getPlaybackAudios`, `getPlaybackFilters` |
| `apps/web/src/main.tsx` | import lazy + `<Route path="playback-history">` |
| `apps/web/src/pages/admin/index.ts` | entrada del barrel |
| `apps/web/src/pages/admin/AdminLayout.tsx` | item en `NAV_SECTIONS`, sección Emisión, permiso `dashboard` |
| `backend/src/app.ts` | `app.use("/admin-api/playback", playbackRouter)` |
| `backend/src/jobs/scheduler.ts` | `registerPlaybackHistoryJob()` |

## Migration

`20261004000000_add_playback_events`. SQLite no puede agregar una columna NOT NULL sin
valor por defecto a una tabla poblada, pero esta tabla es nueva, así que la migration
es un `CREATE TABLE` más dos `CREATE INDEX` y no tiene riesgo de datos. `prisma migrate
deploy` en producción; `prisma migrate dev` en local.

## Casos límite

- **Backend caído varios días.** Al reiniciar, `MAX(played_at)` sigue viejo y el
  siguiente poll cubre el hueco. Si el hueco supera un día, el job lo divide en
  ventanas diarias en vez de pedir todo de golpe.
- **Poll manual desde el panel de Jobs mientras corre el cron.** El guard in-process
  los serializa.
- **Re-subir un archivo genera un `songId` nuevo**, así que en "por audio" cuenta
  como un audio distinto aunque sea el mismo contenido. Es el comportamiento de
  AzuraCast, no un bug nuestro.
- **Filtro de búsqueda sin coincidencias** es el peor caso de `LIKE` (39 ms a 90 días).
- **Transmisiones de DJ** aparecen con `streamer` informado, separado de la
  programación automática.
- **Volumen de red** contra AzuraCast: ~5 registros y ~5 KB cada 5 minutos.
- **Caché de playlists** TTL 10 min: una rotación nueva no aparece en el desplegable
  hasta que expire. Se acepta.

## Fuera de alcance

- Gráficas y estadísticas agregadas (top audios, reproducciones por día o por hora).
- Exportación a CSV.
- Contadores de reproducción de por vida desde AzuraCast (`num_play`).
- Retención configurable por entorno; 90 días es fijo.
- Historial anterior a la primera corrida más allá del backfill inicial.