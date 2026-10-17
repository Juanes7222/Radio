# Intro y outro de programas especiales

Fecha: 2026-10-15

## Objetivo

Que cada programa especial (prédicas, noticias, lectura y similares) entre al aire
con un intro y salga con un outro, una sola vez por emisión, sin importar cuántos
archivos suenen adentro y sin que el oyente note el corte. Hoy eso solo existe para
los programas de un solo archivo.

Preferencia declarada del dueño de la emisora: primero que quede pegado al audio, y
solo si no es posible, que sean pistas separadas.

## Lo que ya existe

El módulo `programs` ya resuelve el caso de un archivo. `composeEpisode`
(`backend/src/modules/programs/program.audio.service.ts:143`) une `[intro, cuerpo,
outro]` con el demuxer concat de ffmpeg y `program.episode.service.ts:132-142` lo
aplica al publicar cada episodio. Es un pegado físico y funciona porque en ese
momento se conoce exactamente qué va a sonar. La limitación que motiva este diseño es
que se compone **por archivo**: para un bloque de N archivos, N lo decide AzuraCast y
no se sabe de antemano cuál es el primero ni el último, así que componer no encaja.

Del lado de AzuraCast ya hay primitivas en uso:
`backend/src/modules/rotation/azuracastPlaylist.service.ts` expone
`getPlaylistOrder` (:175), `setPlaylistOrder` (:187, orden por peso),
`setFilePlaylists`/`updateMediaMetadata` (:209, :319, membresía de una media en una
playlist), `updatePlaylist` (:223, escribe campos arbitrarios, incluido
`backend_options`) y `createPlaylist` (:259, secuencial, `source: songs`).

## La pieza de AzuraCast que habilita el pegado sin ffmpeg

AzuraCast guarda en `StationPlaylist.backend_options` una lista de banderas:
`interrupt`, `single_track` y `merge`. Su generador de Liquidsoap
(`backend/src/Radio/Backend/Liquidsoap/ConfigWriter.php`, `writePlaylistConfiguration`)
las traduce así:

- `merge` produce `merge_tracks(id="merge_<var>", <var>)`, que fusiona **todas** las
  pistas que la playlist entrega en una sola pista continua.
- `single_track` produce `predicate.at_most(1, {ventana})`, o sea que la playlist se
  selecciona **una sola vez** dentro de su franja, no que suene un solo ítem.
- `interrupt` mueve la playlist al conmutador de horario que no respeta la canción en
  curso, para entrar exacto a la hora.

De ahí sale el mecanismo central: una playlist con `source: songs`, orden
`sequential`, `backend_options: ["single_track", "merge"]` y un `schedule_item` que
arranca a la hora del programa reproduce **intro + todo el contenido + outro como una
sola pista, una sola vez, al inicio de la franja**. AzuraCast hace el pegado; el
backend no compone audio.

Nota que esto reemplaza, para el caso de bloque, la configuración `single_track` sin
`merge` que hoy suele usarse para "que suene un solo audio a la hora programada":
`single_track` a secas selecciona la playlist una vez, pero sin `merge` reproduce sus
ítems por separado, así que los bumpers no quedarían pegados.

## Diseño propuesto

Dos caminos, según la forma del programa. El backend decide cuál por la configuración
de la playlist destino.

**Programas de un archivo (prédicas subidas por el panel).** Se conserva
`composeEpisode`. Ya está pegado y no se toca.

**Programas de bloque (noticias, lectura, y cualquier playlist que el dueño arme a
mano en AzuraCast).** El backend sostiene el intro como primera media de la playlist y
el outro como última, y deja la playlist en `sequential` + `single_track`. Si el bumper
es `glued`, agrega también `merge` y AzuraCast fusiona el bloque en una sola pista; si
no, los bumpers suenan como pistas separadas al principio y al final. Esto cubre ambos
casos, cualquier número de archivos y también las playlists que hoy no pasan por el
panel.

### Modelo de datos

Una entidad liviana, no se toca `Program` (que arrastra el flujo de episodios y no
aplica a una playlist hecha a mano).

```prisma
model PlaylistBumper {
  id            String   @id @default(uuid())
  label         String
  // Playlist de AzuraCast a la que se le pegan los bumpers. Una sola por playlist.
  playlistId    Int      @unique @map("playlist_id")
  // unique_id de la media del intro/outro ya subida a la biblioteca de AzuraCast
  introMediaId  String?  @map("intro_media_id")
  outroMediaId  String?  @map("outro_media_id")
  // Copia local del audio, para poder re-subir si la media desaparece de AzuraCast
  introFile     String?  @map("intro_file")
  outroFile     String?  @map("outro_file")
  // true = pegar el bloque con merge; false = bumpers como pistas separadas
  glued         Boolean  @default(true)
  // Estado previo de la playlist, para poder revertirlo al deshabilitar o borrar
  priorBackendOptions String? @map("prior_backend_options")
  priorOrder          String? @map("prior_order")
  enabled       Boolean  @default(true)
  lastSyncedAt  DateTime? @map("last_synced_at")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@map("playlist_bumpers")
}
```

`introMediaId`/`outroMediaId` guardan el `unique_id` de la media, igual que
`ProgramEpisode.mediaId`. La copia local reutiliza el patrón de
`programAssetDir()` (`program.service.ts:99`) y su carpeta de assets.

### Reconciliación

Una función `reconcileBumper(id)` que se ejecuta antes de cada emisión y es
idempotente. Lee `getPlaylistOrder(playlistId)` y deja la playlist en este estado:

1. El intro presente y con el menor peso; el outro presente y con el mayor. Si falta
   alguno en la membresía, lo re-agrega con `setFilePlaylists` sobre la media y luego
   aplica `setPlaylistOrder`.
2. Si `glued` es true, `backend_options` incluye `merge` y `single_track`; si es false,
   solo `single_track`. En ambos casos `order` es `sequential` y `source` es `songs`. Se
   escribe con `updatePlaylist`.
3. Registra el resultado en `lastSyncedAt` y devuelve advertencias legibles (por
   ejemplo, si la playlist no es `source: songs`, `merge` no aplica y hay que avisar).
4. No es de una sola vez: otras partes del backend reescriben la membresía (la rotación
   vacía y reconstruye su playlist cada noche a las 03:30, y los workers agregan noticias),
   así que el orden de los bumpers se vuelve a fijar en cada corrida.

Se apoya en un cron nuevo con la forma de `program.playback.job.ts:14`, cada 5
minutos con `config.locutor.timezone`, más la corrida manual desde el panel de Jobs
(`systemJobs.registry.ts`). También se corre al guardar el bumper desde el panel.

### API

Montada en `/admin-api/bumpers` con `requireAuth` y el permiso `programs` ya existente,
para no obligar a reasignar permisos.

| Endpoint | Cuerpo / query | Respuesta |
|---|---|---|
| `GET /` | — | `{ bumpers }` con el estado de cada uno |
| `POST /` | `{ label, playlistId }` | crea la fila y reconcilia |
| `PUT /:id` | `{ label?, enabled? }` | actualiza |
| `DELETE /:id` | — | borra y despega los bumpers de la playlist |
| `POST /:id/assets/:kind` | `audio` (multipart) | sube intro/outro, los manda a AzuraCast y reconcilia |
| `DELETE /:id/assets/:kind` | — | quita el bumper de ese lado |
| `POST /:id/reconcile` | — | corre la reconciliación a mano |

### Panel

Página nueva `apps/web/src/pages/admin/AdminBumpers.tsx`, ruta `/admin/bumpers`, item
en la sección Contenido, permiso `programs`. Lista las playlists enganchadas con su
estado (intro/outro puestos, advertencias), y un diálogo para elegir la playlist de
AzuraCast y subir el intro y el outro. Sigue las convenciones de la casa: estados
explícitos de carga/vacío/error, `Select` para la playlist, y el aviso del punto 3 de
la reconciliación cuando la playlist no admite `merge`.

### Contrato compartido

Nuevo tipo `PlaylistBumper` en `packages/types/src/admin.ts` y los métodos
correspondientes en `apps/web/src/hooks/useAdminApi.ts`.

## Conflicto encontrado con la limpieza de noticias

Al cruzar el diseño con el código existente apareció un choque que conviene dejar
escrito antes de construir.

Las noticias no se cargan por el panel. Los workers las suben a la carpeta `NOTICIAS`
de la biblioteca y las encolan en la playlist de `AZURACAST_NEWS_PLAYLIST_ID`
(`backend/src/config/azuracast.config.ts:7-12`,
`backend/src/modules/workers/jobDispatcher.ts:77`). La limpieza de esa carpeta borra de
AzuraCast los archivos ya emitidos detectándolos por `media.song_id` contra el historial
de la estación (`backend/src/modules/azuracast/cleanup/folderCleanup.service.ts:80-98`).

`merge` rompe justo eso: al fusionar el bloque en una sola pista, el historial registra
una sola entrada y los `song_id` de los archivos individuales dejan de aparecer, así que
`cleanupNewsFolder` no los reconoce como emitidos y la carpeta crece sin límite. Por eso
**noticias no debe recibir `merge`**: va con `glued: false` (bumpers como pistas
separadas), que conserva el historial por archivo y la limpieza. Rehacer esa limpieza es
un cambio aparte y fuera de esta entrega.

Conviene notar además que el contenido de noticias es una **carpeta**, no media sueltas.
Aunque la playlist siga siendo `source: songs`, el orden relativo entre las media fijadas
y las filas que aporta la carpeta es una de las cosas a verificar antes de sostener el
pegado.

## Los tres casos reales

Buscando "lectura" quedó claro que los tres programas especiales no pasan por el mismo
mecanismo, y el diseño tiene que reconocerlo:

- **Prédicas.** Playlist hecha a mano, uno o pocos archivos. Es el caso limpio: bumpers
  fijados y `glued: true`.
- **Noticias.** Playlist alimentada por los workers desde la carpeta `NOTICIAS`, con la
  limpieza por `song_id` descrita arriba. Va con `glued: false`: los bumpers suenan como
  pistas separadas y el historial sigue registrando cada archivo, así que la limpieza no
  se rompe. Es exactamente el respaldo que el dueño aceptó.
- **Lectura.** Es la rotación bíblica (`backend/src/modules/rotation/`), no una playlist
  quieta: `rotation.service.ts:179-203` **vacía la playlist destino y la reconstruye** en
  cada corrida (03:30). Fijar los bumpers una sola vez no sirve, porque la siguiente
  corrida los borra. Por eso la reconciliación es periódica y, si es `glued: true`,
  reinserta intro y outro como primero y último después de cada reconstrucción.

## Decisiones tomadas

- **Se pega con `merge` de AzuraCast, no con ffmpeg.** Es la única forma de pegar sin
  conocer de antemano el número ni el orden de los archivos, y no duplica el audio ni
  pierde la metadata por archivo de todo el bloque.
- **Entidad nueva `PlaylistBumper` en vez de extender `Program`.** `Program` implica
  episodios subidos por el panel; una playlist hecha a mano en AzuraCast no los tiene.
  Mantenerlas separadas evita ensuciar el flujo de episodios.
- **Se reutiliza el permiso `programs`.** Evita tocar permisos de admins existentes.
- **Se conserva la copia local del intro/outro.** Permite re-subir a AzuraCast si la
  media se borra allá, igual que el módulo `programs` guarda sus assets.
- **Guarda de selección de playlist.** `POST /` y `reconcile` rechazan una playlist que no
  sea de emisión (la rotación general usa `weight`, fusionarla sería catastrófico) y una
  que ya sea la playlist de un `Program`, para no duplicar bumpers sobre el pegado de
  `composeEpisode`.
- **Se revierte el estado previo.** `enabled: false` deja de tocar la playlist y devuelve
  `backend_options` y `order` al valor guardado en la fila; `DELETE` además despega los
  bumpers pero no borra la media de AzuraCast.
- **La franja la define AzuraCast.** El bumper no crea ni mueve `schedule_items`, que ya
  están puestos a mano. Si la playlist no tiene franja, la reconciliación lo reporta como
  advertencia, porque sin franja `single_track` no tiene dónde valer.
- **El pegado es por playlist, no global (`glued`).** Se activa `merge` donde no rompe
  nada (prédicas, lectura) y se deja en pistas separadas donde sí rompería algo (noticias,
  por la limpieza). Respeta la preferencia del dueño sin sacrificar lo que ya funciona.
- **La reconciliación es periódica, no de una sola vez.** La rotación y los workers
  reescriben la membresía de sus playlists, así que el orden de los bumpers se vuelve a
  fijar cada 5 minutos.

## Decisiones abiertas (para el dueño)

- **Alcance del panel.** Si basta con configurar las playlists una vez en AzuraCast y
  que el backend solo re-pine por cron, el panel se reduce a listar y subir bumpers, o
  incluso se puede dejar fuera de esta primera entrega y configurar la fila a mano.
- **Metadata del bloque fusionado.** Con `merge`, el "sonando ahora" muestra el nombre
  de la pista fusionada en vez del título de cada archivo. Sirve para noticias y
  lectura, pero es un cambio visible y hay que confirmar que es aceptable también donde
  hoy se ve el título del archivo.
- **Un solo intro/outro por playlist o un pool que rote.** Se propone uno de cada uno
  por simplicidad. Rotar requiere más de un archivo y una regla de rotación.
- **Confirmar que noticias vaya en pistas separadas.** Es la única con una dependencia
  externa (la limpieza por `song_id`); si el dueño prefiere pegado también ahí, entra
  junto con un cambio a esa limpieza.
- **Estación de verificación.** En este equipo no hay AzuraCast configurado y la emisora
  es la real, así que no hay banco de pruebas: la verificación previa se hace sobre la
  estación en vivo, fuera de horario y con una playlist desechable, y nada se enciende
  hasta que esa prueba pase.

## Verificación previa obligatoria

El diseño se apoya en comportamiento de AzuraCast que hay que confirmar antes de
construir. En este equipo no hay AzuraCast configurado y la emisora es la real, así que
la prueba se hace en vivo, fuera de horario, con una playlist desechable de archivos
cortos y silenciosos, sin tocar ninguna playlist en uso:

- `merge` + `single_track` + `sequential` reproduce intro + contenido + outro como
  una sola pista continua, una vez, al inicio de la franja.
- El `merge_tracks` de Liquidsoap aplica o no el crossfade de la estación entre las
  pistas fusionadas. Si lo aplica, hay que decidir el crossfade para que los bumpers
  no se mezclen con el contenido.
- Si tras emitirse el bloque el intro y el outro siguen en `getPlaylistOrder` o si
  AzuraCast los consume. Esto decide si la reconciliación tiene que reinsertar en cada
  emisión o solo una vez.
- Si el contenido proviene de una **carpeta** de la biblioteca en vez de media
  sueltas, si `getPlaylistOrder`/`setPlaylistOrder` cubren esas filas y si el intro
  puede convivir con una fuente por carpeta en la misma playlist.
- Qué hace `merge` con la duración y el "sonando ahora" cuando el bloque es largo.

## Casos límite

- **La playlist no es `source: songs`.** `merge` no se emite, así que no hay pegado; la
  reconciliación devuelve advertencia y no rompe nada.
- **Playlist compartida con la rotación general.** No debe usar `merge`, porque
  fusionaría toda la música. La reconciliación no toca playlists ajenas al bumper.
- **Media del intro borrada en AzuraCast.** La copia local permite re-subir; si no hay
  copia, la reconciliación reporta el bumper como faltante.
- **Cambio de playlist destino.** Al editar `playlistId` hay que despegar de la anterior
  y enganchar en la nueva, igual que el módulo `programs` mueve episodios al cambiar de
  playlist.
- **Programa que no lleva intro.** No se crea fila; nada cambia.
- **Emisión en vivo encima del bloque.** `interrupt` y la prioridad de playlist de
  AzuraCast (posterior a septiembre 2024) deciden quién gana; fuera del alcance de este
  diseño resolverlo.

## Fuera de alcance

- Componer el bloque con ffmpeg para obtener un solo archivo físico. Se evaluó y se
  descartó: exige enumerar el bloque antes de la hora, duplica el audio, pierde la
  metadata por archivo y falla si el contenido cambia a última hora.
- Introducir bumpers en playlists que no son la unidad de emisión (rotación general,
  música continua).
- Rotación de varios intros/outros.
- Cambiar el crossfade global de la estación.

## Migration

Migración nueva `20261015000000_add_playlist_bumpers` con un `CREATE TABLE` en
`backend/prisma/schema/bumpers.prisma` y un `@@unique` sobre `playlist_id`. Tabla
nueva, sin riesgo de datos. `prisma migrate deploy` en producción, `migrate dev` en
local.

## Integración

| Archivo | Cambio |
|---|---|
| `backend/prisma/schema/bumpers.prisma` | modelo `PlaylistBumper` |
| `backend/src/modules/bumpers/bumper.constants.ts` | permiso y límites |
| `backend/src/modules/bumpers/bumper.service.ts` | CRUD + subida + reconciliación |
| `backend/src/modules/bumpers/bumper.routes.ts` | endpoints admin |
| `backend/src/modules/bumpers/bumper.job.ts` | cron de reconciliación |
| `backend/src/jobs/scheduler.ts` | registrar el cron |
| `backend/src/systemJobs.registry.ts` | corrida manual |
| `backend/src/app.ts` | montar `/admin-api/bumpers` |
| `packages/types/src/admin.ts` | tipo `PlaylistBumper` |
| `apps/web/src/hooks/useAdminApi.ts` | métodos del panel |
| `apps/web/src/pages/admin/AdminBumpers.tsx` | página nueva |
| `apps/web/src/main.tsx`, `pages/admin/index.ts`, `AdminLayout.tsx` | ruta, barrel y navegación |
