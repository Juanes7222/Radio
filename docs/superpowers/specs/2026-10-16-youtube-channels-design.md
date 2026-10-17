# Canales de YouTube desde el panel - Diseno

## Intent

El objetivo de la estacion es dejar de guardar configuracion en variables de
entorno y moverla al panel admin. El primer consumidor es la suscripcion
automatica a canales de YouTube: hoy la lista de canales vive en
`YOUTUBE_CHANNEL_IDS` y `YOUTUBE_CHANNEL_NOTICES`, se lee al arrancar el
proceso y no se puede cambiar sin editar `.env` o Infisical y reiniciar.

Con este cambio el admin abre la pagina de YouTube, escribe el id o la URL de
un canal, elige si es de noticias o de contenido general, y lo ve en la lista
con su ultimo aviso recibido y su estado de suscripcion. Dar de baja un canal
es un boton.

## Hallazgo que reencuadra el problema

Medido el 16 de octubre de 2026 contra la maquina de desarrollo:

```
GET https://www.youtube.com/xml/feeds/videos.xml?channel_id=<cualquiera>
  -> 200, 463 bytes, siempre el mismo stub:
     <feed> ... <title>YouTube video feed</title> </feed>
     sin <entry>, sin <yt:channelId>
```

Se comprobo con un canal que existe (`UC_x5XG1OV2P6uZZ5FSM9Ttw`, Google
Developers), con el canal de ejemplo del proyecto
(`UCVqtYvLNHvGymJFoGeRH7nw`) y con un id inventado. **Los tres devuelven los
mismos 463 bytes.** El endpoint ignora el `channel_id` y ya no publica videos.

El hub `pubsubhubbub.appspot.com/subscribe` sigue respondiendo `202` a una
suscripcion nueva, pero ese `202` se emite antes de verificar el callback: dice
que la peticion fue aceptada, no que el topic tenga contenido. El topic es el
feed de arriba, asi que **la cadena WebSub actual no puede entregar ningun
video**. Esto no es una hipotesis: es la lectura directa del endpoint que el
backend suscribe.

Consecuencia para este trabajo: el registro de canales, el panel y el estado
son validos con cualquier transporte, asi que se construyen igual. Lo que **no**
se hace aqui es cambiar el transporte, porque las dos salidas reales cuestan
dinero o infraestructura y esa decision es del dueno de la estacion:

| Opcion | Que cuesta | Que hay que hacer |
|---|---|---|
| YouTube Data API v3 + polling | Una API key de Google (cuota 10.000/dia) | `playlistItems.list` sobre la playlist de subidas, cada 10 min |
| YouTube Data API v3 + Pub/Sub push | Proyecto en Google Cloud, cuenta de servicio, topic Pub/Sub, endpoint de push | La migracion que YouTube recommends hoy |

La primera cabe en el objetivo del proyecto (quita dos variables y agrega una)
y se puede hacer en unas 80 lineas. **Queda planteada, no hecha**; este
documento la deja especificada para decidirla con el dato en la mano.

Mientras tanto el panel **verifica el feed al agregar un canal** y lo dice. Es
la unica forma de que el silencio del pipe se vea desde el producto y no desde
un ticket.

## Decisiones

### 1. La base de datos es la fuente de verdad

La tabla `YouTubeSubscription` se renombra a `YouTubeChannel`. El nombre viejo
ya miente: hoy recibe un `upsert` al arrancar y nadie lo lee. Al principe era un
espejo del `.env`; a partir de este cambio es la configuracion, y por eso se
llama como lo que es.

Renombrar en vez de ampliar tiene un costo (crear, copiar, borrar) y una
ventaja que importa mas: la columna `active` desaparece. "Dar de baja un canal"
borra la fila. No hay un tercer estado que el panel tenga que explicar y que
nadie use.

```prisma
model YouTubeChannel {
  id                String   @id @default(uuid())
  channelId         String   @unique
  title             String
  category          String   @default("GENERAL")   // GENERAL | NEWS
  subscribedAt      DateTime?
  expiresAt         DateTime?
  lastNotifiedAt    DateTime?
  subscriptionError String?
  feedEntryCount    Int?                           // null = feed sin verificar
  feedCheckedAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

`category` es el reemplazo de `YOUTUBE_CHANNEL_NOTICES`: decide si el video va a
la carpeta `NOTICIAS` y a la playlist de noticias, o a `CONTENIDO VARIADO` y a
la general. Es un `String` porque SQLite no tiene enum; la union estrecha vive
en `packages/types/src/admin.ts` y el servicio es el unico lugar donde se
concilia, igual que hace `feedback.service.ts`.

`feedEntryCount` es el autodiagnostico. `null` significa "nunca se verifico";
`0` significa "el feed respondio pero no trae videos". Es mas honesto que un
booleano porque distingue "no se ha comprobado" de "comprobado y vacio".

### 2. Los identificadores de canal los escribe el admin

No hay forma de resolver el nombre de un canal sin credenciales de Google, y no
se va a agregar una credencial para esto. El admin pega el id
(`UCVqtYvLNHvGymJFoGeRH7nw`) o la URL completa del canal, y el backend extrae el
id. El nombre lo escribe el admin, con el texto que el conoce
("Radio对手 - Noticias"), no el que devuelve una API que ya no responde.

### 3. La suscripcion se renueva con un cron, no con un setInterval

Hoy `index.ts` re-suscribe cada 20 horas con `setInterval`, lo que significa
que un canal nuevo tarda hasta 20 horas en ponerse y que un proceso reiniciado
cambia el comportamiento. Pasa a ser `youtube.subscription.job.ts`, cada 6
horas con el lease de 24: cuatro intentos por ciclo. Se sigue llamando una vez
al arrancar, sin `await`, para que la ingesta no espere al reinicio.

El intervalo de 20 h estaba escrito a mano en `index.ts` y no era configurable.
Ahora es `youtube.config.ts`... no: **no hay `youtube.config.ts`**, ese archivo
desaparece con las variables que ya no existen.

### 4. Dar de baja borra local primero, unsubscribe despues

Al borrar un canal se borra la fila y luego se avisa al hub. En ese orden, y no
al reves: si el hub no responde, el canal sigue pushed por el hub durante el
lease, pero el backend lo ignora. El orden inverso dejaria un canal en la base
que el hub ya no manda y que nadie puede volver a susccribir.

### 5. Una notificacion de un canal que no esta, se ignora

Hoy el webhook acepta cualquier Atom valido y crea el video y el job,Failed si
el canal no esta suscrito. Con el panel a la vista eso seria desconcertante: un
canal borrado seguiria llenando la lista de notificaciones. Se rechaza con un
`warn` en el log, sin crear nada, y el `200` se mantiene para que el hub no
reintente.

Falla cerrado, igual que `POST /api/prayer/:id/answer-read`: no hay nada que
demostrar.

### 6. Se elimina la variable, no se la deja de respaldo

`YOUTUBE_CHANNEL_IDS` y `YOUTUBE_CHANNEL_NOTICES` desaparecen de
`youtube.config.ts`, de `.env.example` y de `docs/infisical-setup.md`. Dejarlas
como respaldo seria la forma mas facil de que alguien las edite sin saber que ya
no hacen nada.

Eso obliga a un **backfill de una vez**: `backend/src/scripts/backfillYoutubeChannels.ts`
lee las dos variables viejas del entorno y escribe las filas. Sin el, el deploy
detiene la ingesta en silencio hasta que alguien vuelva a agregar los canales a
mano. El script corre una vez y despues se borran las variables de Infisical.

### 7. Permiso

Se reutiliza `youtube`. No se agrega nada a `AdminPermission`: la pagina ya
existe con ese permiso en la barra lateral.

## Lo que el admin ve

Una sola pagina, `/admin/youtube`, en cuatro bloques ordenados como la cadena
real: entra el material, se procesa, lo ejecutan unos workers, y raramente se
despliega una version.

```
┌───────────────────────────────────────────────────────────────────────┐
│  Canales de YouTube                                          [ Actualizar ]
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  [ id o URL del canal                          ]  [Noticias ▾]  │  │
│  │  [ Agregar canal ]                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Radio Contrapunto · NOTICIAS                          hace 2 h   ⌄ ✕ │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  UC…nw · detectado hace 2 h                                          │
│                                                                       │
│  Seventh-day Adventist · GENERAL                     hace 6 d   ⌄ ✕ │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  UC…tw · sin avisos                                                    │
└───────────────────────────────────────────────────────────────────────┘
```

Debajo, y en el orden en que ocurre, la tabla de **jobs de procesamiento**,
que es la lista de notificaciones recibidas: cada video que llego por el feed
tiene su job, con su estado y su ultimo error. followed de los **workers
conectados** y, al final, el **despliegue de version**, que es lo raro.

### Por que no hay una lista aparte de notificaciones

El spec pidio al principio un endpoint `/notifications` con los ultimos videos
recibidos. Se escribio, se reviso contra la pagina, y se quito. La tabla de jobs
ya es exactamente esa lista: el webhook crea el `YouTubeVideo` y el
`ProcessingJob` juntos, uno a uno, sin excepcion, asi que un segundo listado
mostraria las mismas filas con menos datos y ocuparia otra pantalla para
comparar. Lo que si aporta la lista de canales y no aporta la de jobs es **por
canal**: si el ultimo aviso fue hace seis dias o nunca llego.

Dejar el endpoint sin uso habria sido peor: es codigo que ships al navegador y
nadie llama. Si hace falta el desglose de "publicado por YouTube" contra "recibido
por la estacion", esa columna se agrega a la tabla de jobs cuando se pida.

### Direccion visual

El panel ya tiene un sistema: "studio night", primario ambar de senal, y un
rojo `--tally` reservado exclusivamente a lo que esta al aire. Esta pagina no
inventa una identidad nueva: el riesgo deeteriorar una consola que ya es
coherente es mayor que el de ser original. Lo distintivo va en la tipografia y
en la estructura, no en la paleta.

**La idea:** en un feed, lo unico que importa es si sigue llegando algo. Un
canal callado es el fallo, y el fallo no se anuncia con una etiqueta roja sino
con el silencio. Por eso la pieza central de esta pagina es una **linea de
silencio**: dentro de cada canal, una regla de dos pixeles cuyo relleno ambar
representa cuanto lleva callado ese canal, relativo al canal mas callado de la
lista. Uno que acaba de hablar esta lleno; uno que lleva seis dias en silencio
esta casi vacio. Compara entre canales de un vistazo, sin numeros, sin rojo, y
convierte una lista de datos en una sola columna que se escanea.

Es el unico lugar donde se gasta la audacia. Todo lo demas se queda callado:
sin barra de progreso, sin contador, sin badge de estado, sin icono decorativo.

- **Tipografia.** IBM Plex Sans para el nombre del canal (el operador piensa en
  nombres, no en ids) e IBM Plex Mono para todo lo que es dato: el id, la
  categoria, la hora exacta. El id nunca aparece como texto principal; esta en
  mono, chico, debajo del nombre. El tiempo relativo manda y el absoluto
  acompana, al reves de una columna de fechas.
- **Estructura.** Filas anchas, no una tabla de ocho columnas. Una tabla es
  exactamente lo que hace que esto se lea como "mucho contenido". Sin pestanas:
  una pestana esconde justo lo que se vino a mirar.
- **Movimiento.** Solo la linea de silencio, 600 ms de ease al montar y en cada
  sondeo, con `prefers-reduced-motion` respetado. Nada mas se mueve.
- **Accesibilidad.** La linea es decorativa (`aria-hidden`): la misma
  informacion la lleva el texto "hace 6 d" y el `title` de la fila, que en
  espanol explica el motivo ("Suscripcion vencida"). El color nunca es el unico
  portador de un dato.
- **Vacio.** Sin canales, la caja de agregar es lo unico que se ve, con la
  frase "Los canales que agregues aqui se suscriben automaticamente". Es una
  invitacion, no un mensaje de error.

### Moverse con el raton y con el teclado

- El formulario de alta es un `<form>` real: Enter envia. El campo tiene
  `aria-describedby` apuntando al error, y `aria-invalid` en el borde.
- Botones de quitar y re-susccribir con `aria-label` que nombra el canal
  ("Quitar Radio Contrapunto"), porque un icono sin nombre no dice nada.
- Foco visible con el anillo del tema. En movil la fila envuelve nombre sobre
  meta y los botones se quedan en 44 px.

## Contratos

```ts
type YoutubeChannelCategory = "GENERAL" | "NEWS";
type YoutubeChannelState = "subscribed" | "expiring" | "failed" | "unverified";

interface YouTubeChannelInfo {
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

interface YouTubeChannelListResponse {
  channels: YouTubeChannelInfo[];
}
```

`state` es derivado, nunca guardado: `failed` si hay `subscriptionError`,
`expiring` si el lease vence antes de la proxima pasada, `unverified` si nunca
se comprobo el feed, `subscribed` si no. Derivarlo evita que la base pueda
contener un estado que contradiga sus propias fechas.

## Endpoints

Todos montados en `/admin-api/youtube`, con `requireAuth` y
`requirePermission("youtube")`, y el router de administracion se registra en
`app.ts` **antes** del del webhook para que un `router.use(requireAuth)` suyo
nunca alcance `/webhook`.

| Metodo | Ruta | Que hace |
|---|---|---|
| GET | `/channels` | Todos los canales con su estado y su ultima notificacion |
| POST | `/channels` | Agrega un canal, verifica el feed y se suscribe |
| DELETE | `/channels/:channelId` | Borra la fila y avisa al hub, en ese orden |
| POST | `/channels/:channelId/resubscribe` | Fuerza una pasada ahora |

`POST /channels` responde `409` con el motivo si el canal ya existe, y `422` si
el feed respondio pero esta vacio. No es un rechazo del alta: la fila se crea y
el `202` vuelve con el canal creado y `feedEntryCount: 0`, porque un canal
existe aunque YouTube no avise. Bloquear el alta dejaria al admin sin forma de
registrar un canal que todavia no publico nada.

## Lo que queda fuera

- **Cambiar el transporte a la YouTube Data API.** Especificado arriba, no
  implementado. Es la decision mas grande que hay alrededor de esta pagina y
  no se toma por su cuenta.
- **Reordenar o limpiar `AdminBumpers`, `AdminJobs` y las paginas con clases
  literales de slate.** Deuda conocida, ajena a este cambio.
- **Una tabla de eventos crudos del webhook.** "Que notificaciones se han
  recibido" ya lo responden los videos: son la notificacion convertida en
  trabajo. Una tabla de bites crudos seria una segunda fuente de verdad para lo
  mismo. Por la misma razon no quedo el endpoint `/notifications`: ver "Por que
  no hay una lista aparte de notificaciones".

## Pruebas que deberian existir

El backend no tiene runner y no se le agrega uno (AGENTS.md). Lo que si hay es
vitest en `apps/web/tests`, con tests estaticos que leen el fuente. Las de esta
pagina:

- La entrada de la barra lateral de `/admin/youtube` lleva el permiso `youtube`.
- La pagina llama a los cinco endpoints por su nombre, no por una cadena armada.
- `AdminYouTube.tsx` no vuelve a leer `YOUTUBE_CHANNEL_IDS` ni a montar el
  `setInterval` de suscripcion.
- El mapeo de `category` a carpeta y playlist es el mismo en el dispatcher y en
  la subida del worker, leidos de los dos archivos.

En el backend, cuando se monte Vitest:

- Un id de canal con formato invalido devuelve `400` y no toca el hub.
- Una URL de canal (`https://www.youtube.com/@nombre`) se reduce a su id, y una
  URL que no trae id devuelve `400`.
- `POST /channels` con un id repetido devuelve `409` y no vuelve a suscribir.
- Borrar un canal borra la fila aunque el hub devuelva error, y deja el error
  en el log.
- Una notificacion de un canal inexistente no crea video ni job.
- `state` sale `expiring` cuando el lease vence antes de la proxima pasada de 6h.