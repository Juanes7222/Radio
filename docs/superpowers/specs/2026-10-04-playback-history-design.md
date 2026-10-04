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

Verificado contra la estación real: la respuesta trae además `playlist_chain`,
`playlist_source`, `listeners_start`, `listeners_end`, `delta_total` e `is_visible`,
que no se guardan. En 510 registros ninguno vino sin `song.id` ni sin `song.title`, y
`played_at` viene en segundos unix. Los nombres de playlist pueden llevar tildes
(`MÚSICA`), lo que es seguro en una columna TEXT.

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

`playbackHistory.ts` expone `capturePlaybackHistory()`, siguiendo la forma de
`listenerHistory.service.ts:18-38`:

1. Lee `MAX(played_at)` y `MIN(played_at)` de la tabla (0,03 ms medidos).
2. Si hay alguna fila, consulta la ventana `[max - 10 min, ahora]`. **Este poll corre en
   toda corrida**, incluso con la cobertura incompleta: el backfill del punto 3 camina
   hacia atrás desde el evento más antiguo y nunca alcanza el extremo reciente, así que
   atarlo al "si no" congelaría el log.
3. Si `MIN(played_at)` no alcanza el piso de retención, hace *backfill* por días desde
   el piso hasta `MIN(played_at)`. Sin esto la página estaría vacía durante meses.
4. Mapea los registros a filas y las inserta, deduplicando por `azuracast_sh_id`.
5. Poda, siempre, aunque la recolección haya fallado.

El disparador del *backfill* se ancla en la fila **más antigua**, no en la vaciedad de
la tabla, con un margen de un día para distinguir "tabla llena" de "recién sembrada".
Anclado solo en `MAX(played_at)`, una interrupción a mitad del *backfill* lo dejaría
incompleto para siempre.

**El límite real de AzuraCast obliga a acotar la retención.** Medido contra la
estación: hay registros a 60 días de antigüedad y ninguno a 60,5. AzuraCast conserva
unos 60 días, así que pedir 90 es pedir datos que la fuente ya borró y que ninguna
frecuencia de *polling* puede recuperar. La retención queda en **55 días**, con 5 días
de margen contra el recorte de la fuente.

**El backfill está acotado y reanuda.** Camina hacia atrás desde el evento más antiguo
que ya tenemos, no desde `now`, así que una corrida interrumpida o detenida por el tope
retoma donde se quedó en vez de recorrer la ventana entera otra vez. Se detiene tras 3
ventanas diarias vacías consecutivas.

El anclaje en el evento más antiguo no es un detalle: si la franja entre el piso de
retención y la profundidad real de AzuraCast no tuviera ninguna reproducción —por
porque la estación estuvo apagada en ese periodo— `MIN(played_at)` nunca tocaría el
piso, la condición de cobertura seguiría insatisfecha y cada corrida volvería a
recorrer toda la ventana. Anclando en `oldest`, ese caso degrada a 1 petición de poll
más hasta 3 de caminata, en vez de ~56.

El tope de ventanas vacías también aplica al poll cuando hay una caída larga, y ahí sí
tiene un coste: tras 3 días seguidos sin ninguna reproducción, el poll corta antes de
llegar al día en que la estación volvió y ese día se pierde de forma permanente. Una
radio 24/7 no se queda tres días en silencio sin que el vigilante de salud ya haya
avisado, y la alternativa sin tope serían ~60 peticiones por corrida indefinidamente,
así que el trade-off se queda como está. El log `Backfill stopped after empty windows`
delata el corte.

**El insert idempotente.** Prisma 6.19.3 sobre SQLite no soporta `skipDuplicates`: no
aparece en el cliente generado que consume la app
(`node_modules/.prisma/client/index.d.ts`, cero apariciones) y `BibleBookCreateManyArgs`
solo declara `data`. El patrón es un `findMany` de los `sh_id` del lote más un
`createMany` de los que faltan, con un guard in-process que serializa corridas
solapadas — el mismo patrón que el in-flight dedup de `bibleSource.service.ts:223-275`.
Si aun así colara un `P2002`, la ventana solapada del siguiente tick lo resuelve.

**Por qué lotes de un día y no fila por fila.** Medido: 3,3 ms por fila contra
3,4 ms por lote de 3, 25 ms por lote de 480 y 19 000–30 000 filas/s en lote grande. El
fsync por commit en WAL domina. Los 55 días de *backfill* cuestan 68 s fila por fila y
2,3 s con lotes de un día.

**Poda.** La misma corrida borra lo anterior a la ventana de retención, igual que
`SNAPSHOT_RETENTION_DAYS` en `listenerHistory.service.ts:5,34-37`. Se ejecuta aunque la
recolección haya lanzado: si no, un fallo de AzuraCast es justo el caso en que la tabla
crece sin límite, y el error original debe seguir propagándose para que lo registre el
cron.

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
duro: 55 días, alineado con la retención. Una ventana más ancha, un `from` posterior
al `to` o una fecha mal formada se rechazan con 400 en vez de degradarse en silencio.

`limit` es 20 por defecto y 50 como máximo, igual que en `prayer.routes.ts:33-37`.
`playlist` es coincidencia exacta sobre el nombre de playlist de AzuraCast.
`automated` es `"1"` para excluir las transmisiones de DJ (las que tienen `streamer`
informado) y mostrar solo programación automática. No se llama `requests` porque
`isRequest` en AzuraCast significa "canción pedida por un oyente", que es otra cosa.
`search` busca con `contains` sobre título y artista.

| Endpoint | Query | Respuesta |
|---|---|---|
| `GET /playback/log` | `from,to,playlist,search,automated,page,limit` | `{ rows, total, page, totalPages }` |
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

Cifras de volumen medidas contra la estación real: una ventana de 36 horas devolvió
**510 registros, 288 KB**, es decir ~340 reproducciones por día y ~0,56 KB por
registro. Eso son ~30 600 filas y ~17 MB de JSON a 90 días, y ~18 700 filas a los 55
días de retención reales. También confirma que el
*backfill* debe ir por días: 30 días en una sola petición serían ~5,7 MB, por encima
del timeout de 15 s de `AZURACAST_REQUEST_TIMEOUT_MS`.

Los tiempos de consulta de abajo vienen de un banco SQLite desechable con el esquema
real y tres perfiles de 90 días (tracks de 4,6 min con 2 500 audios distintos; de
3 min con 2 500; y de 3 min con 8 000), con `EXPLAIN QUERY PLAN` y p50/p95 sobre 20
corridas. La columna de 90 días es el peor caso medido, por encima del tope real de 55
días: el caso que la UI nunca puede pedir.

| operación | 30 días | 90 días |
|---|---|---|
| log, página 1 | 0,12 ms | 0,12 ms |
| log, página 250 (offset 4980) | 0,50 ms | 0,93 ms |
| `COUNT(*)` del log | ~0,7 ms | 2,2 ms |
| `GROUP BY song_id`, top 20 | 11,8 ms | 48,9–58,2 ms |
| total de audios distintos (`SELECT DISTINCT song_id`) | 15 ms | 46 ms |
| `DISTINCT playlist` | 3,2 ms | 17–29 ms |
| metadatos de 20 audios | — | 1,75 ms (41 ms sin índice) |
| búsqueda `LIKE` sin coincidencias | ~15 ms | 39 ms (p95 94 ms) |

Carga por página del admin: log ~2 ms; vista por audio ~27 ms a 30 días, ~105 ms
p50 / ~135 ms p95 a 90 días. Un solo hilo, y solo si un admin navega muchas páginas
por minuto. Ninguna de estas consultas es un cuello de botella.

El total de audios distintos se cuenta con `SELECT DISTINCT song_id` y no con
`COUNT(DISTINCT ...)`, porque Prisma no expone el segundo. La diferencia medida es
46 ms contra 39 ms a 90 días, y a cambio no hay SQL crudo en el servicio.

**El `GROUP BY` crece linealmente con la ventana.** Esa es la frontera del diseño: si
algún día se quiere más de 55 días, esa vista pasa a cientos de ms y haría falta una
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
a ~3-4 MB con los ~18 700 filas de la retención real de 55 días. Acotado por la
retención, así que no crece más allá. Normalizar
título/artista en una tabla de dimensión lo reduciría, pero reintroduce un JOIN en el
camino caliente y no vale ese ahorro.

## Panel

Página nueva `apps/web/src/pages/admin/AdminPlaybackHistory.tsx` con dos pestañas
sobre el mismo filtro:

- **Log**: una fila por reproducción, con fecha y hora, título, artista, playlist y
  un distintivo si fue una petición o una transmisión de DJ.
- **Por audio**: una fila por audio con total de reproducciones, primera y última
  vez, ordenable.

Filtros compartidos: rango de fechas (presets de 7/30/55 días más fechas a mano),
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
- **Si se reconstruye la base de datos de AzuraCast**, su `sh_id` reinicia en 1 y las
  columnas nuevas colisionarían con el índice único, con lo que el job dejaría de
  insertar de forma silenciosa (solo un warning en el log). No se diseña nada para
  esto: es una operación administrativa rara y la remedio es vaciar `playback_events`.
  Queda anotado en la documentación del módulo.

## Fuera de alcance

- Gráficas y estadísticas agregadas (top audios, reproducciones por día o por hora).
- Exportación a CSV.
- Contadores de reproducción de por vida desde AzuraCast (`num_play`).
- Retención configurable por entorno; 55 días es fijo y coincide con lo que AzuraCast
  conserva más 5 días de margen.
- Registrar o consultar histórico de más de 55 días: la fuente ya lo borró. Si hace
  falta más historia, hay que actuar antes de que AzuraCast recorte, no después.
- Historial anterior a la primera corrida más allá del backfill inicial.