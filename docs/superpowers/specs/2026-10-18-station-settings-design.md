# Ajustes de la estación en el panel — Diseño

Fecha: 2026-10-18
Estado: propuesta para revisión

## 1. Intención y por qué

La estación se opera hoy desde el entorno: ~120 declaraciones entre
`backend/.env.example`, Infisical, el ejemplo del worker y el del script de
backup. Cada ajuste que un operador querría tocar durante la operación —
a quién le llega la alerta, cuánta sonoridad tiene un episodio, cuántos avisos
salen por hora, cuánta gente recibe la notificación de una oración — obliga a
editar un archivo, reiniciar el proceso y rezar para no romper nada.

El objetivo es que esas decisiones vivan en el panel y que las que no son de la
radio sigan donde están. La línea que separa ambos grupos es explícita y es la
restricción central de este diseño: **el panel controla la radio, no el
servidor**.

## 2. Objetivos

- Que un operador pueda leer y cambiar los ajustes de la emisora sin tocar un
  archivo ni reiniciar el backend.
- Que cada valor siga teniendo un origen, un rango válido y una unidad
  documentada, en el mismo lugar donde se lee.
- Que cambiar un ajuste no pueda dejar la estación sin voz: si la base de datos
  no responde, el sistema sigue emitiendo con los valores del entorno.
- Que quede registrado quién cambió qué y cuándo.

## 3. No objetivos

- **No** mover secretos a la base de datos. Ver la sección 8.
- **No** mover rutas del sistema de archivos (`MEDIA_DIR`, `TEMP_DOWNLOAD_DIR`,
  `PROGRAMS_TEMP_DIR`, `PROGRAMS_ASSET_DIR`, `PROGRAMS_ART_DIR`,
  `BUMPERS_ASSET_DIR`, `GEOIP_MMDB_PATH`, `GEOIP_DBIP_PATH`, `BACKUP_DIR`,
  `BACKUP_LOG_FILE`, `HEALTH_DISK_MOUNT_PATH`). Son hechos sobre la máquina que
  corre el backend, no decisiones de la emisora. Ponerlos en un formulario
  crearía la ilusión de que se pueden cambiar sin consecuencias, y el
  día que alguien lo intente el backend deja de encontrar sus archivos.
- **No** mover la topología de logs y contenedores (`PM2_*`, `NGINX_*`,
  `DOCKER_CONTAINER_*`, `POSTGRES_LOG_FILE`).
- **No** mover expresiones cron (`PROGRAMS_SYNC_CRON`, `BUMPERS_SYNC_CRON`,
  `GEOIP_UPDATE_CRON`). Se leen una vez al registrar el job; hacerlas editables
  exige un registro de jobs capaz de desregistrarse y re-registrarse, que es un
  proyecto aparte.
- **No** mover nada del arranque: `INFISICAL_*`, `PORT`, `WS_PORT`,
  `DATABASE_URL`. Son la condición de posibilidad del proceso.
- **No** tocar el entorno de build (`VITE_*`, `EXPO_PUBLIC_*`) ni el del worker.
  El primero se incrusta en el bundle; el segundo vive en otro equipo.

## 4. Antiobjetivos

Lo que haría que esto fracasara aunque tecnicamente funcionara:

- Un panel que declara editar algo y en realidad no lo cambia. Ya existe un
  caso en el repositorio (sección 5.4) y no se debe repetir.
- Un panel donde cambiar un valor deja la radio muda porque la caché no se
  refrescó o porque el arranque no supo leer la base.
- Un formulario de 40 campos donde el operador no sabe cuál es el que le
  importa y cuál no debería tocar.
- Duplicar lo que `AnnouncementSettings` ya resuelve bien.

## 5. Estado actual del código

### 5.1 El config se resuelve al importar

Mover una variable a la base no es cambiarla por una fila: es resolver que algo
async la lea, y ese algo hoy casi no existe. La sección 5.2 dice exactamente qué
queda congelado y en qué tres archivos ya hay un patrón que funciona.


### 5.2 Todo `config.*` literal queda congelado al importar

`backend/src/config/index.ts` es un objeto literal evaluado en el momento del
import, y casi todos los módulos de `backend/src/config/` declaran
`export const xConfig = { ... }`. Cualquier valor leído a través de ellos queda
congelado para toda la vida del proceso.

Solo tres archivos escapan: `health.config.ts`, `logs.config.ts` y
`backups.config.ts`, que usan getters perezosos para sobrevivir a la carga
tardía de los secretos de Infisical. Ese es el patrón a replicar.

Los casos concretos donde el congelamiento no se puede evitar aunque se quiera:

- `backend/src/modules/azuracast/azuracast.client.ts:7-12` crea la instancia de
  axios y exporta `STATION_ID` como constante al importar.
- `backend/src/modules/workers/jobDispatcher.ts:12` calcula `DEADLINE_MS` a
  nivel de módulo.
- `backend/src/modules/locutor/tts/elevenLabs.provider.ts:12-13` captura
  `config.locutor.tts.elevenLabs` entero y construye el `ApiKeyPool` en el
  import. Esto incluye `quotaCooldownMinutes`, `transientCooldownMinutes` y
  `subscriptionCacheMinutes`, que quedan congelados junto con el resto aunque la
  Fase 7 no los mencione.
- `backend/src/modules/health/health.job.ts:12-15` lee `intervalSeconds` una
  sola vez y lo convierte en la expresión cron `*/N * * * *`. El intervalo del
  vigilante **no** es un valor caliente: cambiarlo exige reiniciar.

`app.ts:213-221` pertenece a otra categoría: `createApp()` corre dentro de
`startServer()`, o sea después de la hidratación, así que el orden no lo ata. Lo
que lo ata es que `express.static` resuelve el directorio una vez al montar. El
efecto práctico es el mismo, pero el motivo importa para no buscar el problema
en el sitio equivocado.

`shared/utils/date.ts:79,83` (`getStationTime`) también lee
`config.locutor.timezone`, y lo usan las rutas de avisos
(`announcement.routes.ts:9,47`).


### 5.3 Ya existe un patrón bueno: `AnnouncementSettings`

`backend/prisma/schema/announcement-playback.prisma` ya define una fila
única `AnnouncementSettings`, y `backend/src/modules/locutor/settings.service.ts`
ya resuelve de la forma correcta:

- Si la fila existe, manda la fila.
- Si no existe, se crea desde `fromEnv()`, de modo que una instalación que ya
  define variables no requiere migración manual.
- `LIMITS` acota lo que el panel puede enviar y el backend no confía en la UI.
- `updateSettings` aplica un parche parcial, así el panel puede enviar un
  formulario sin borrar lo que no envió.
- `toPublicSettings` reemplaza la contraseña del streamer por `null` más un
  booleano `hasStreamerPassword`: el secreto no sale del backend.

`AnnouncementSettings` **ya cubre** `LOCUTOR_ANNOUNCEMENTS_PER_HOUR`,
`LOCUTOR_ANNOUNCEMENT_MIN_GAP_MINUTES`, `LOCUTOR_BEDS_DIR` y
`LOCUTOR_BED_VOLUME`, más un conjunto de campos que nunca fueron variables de
entorno. Es decir: parte del objetivo de este proyecto ya está hecha, y con el
mismo patrón que este documento propone extender.

### 5.4 La zona horaria ya está duplicada (deuda real)

`AnnouncementSettings.timezone` es editable desde el panel y se usa para calcular
el plan en `announcementPlan.service.ts:144` y `playback.job.ts:82`. Pero
`hourly.job.ts:100`, `nightly.job.ts:29` y `playback.job.ts:425` siguen
registrando sus crons con `config.locutor.timezone`, que viene del entorno.

Consecuencia: hoy un operador puede cambiar la zona horaria en el panel y el
sistema queda con el plan en una zona y los horarios en otra. No es una
hipótesis, es el estado del código. La sección 9 lo resuelve.

### 5.5 El nombre de la estación está duplicado en dos fuentes

La fuente real es AzuraCast. La leen el header público
(`useGlobalAudio().data?.station?.name`, que llega del now-playing), la sesión del
panel (`auth.service.ts:86-99` `fetchStationName()`, que va al claim del JWT en
`auth.service.ts:150` y de ahí al sidebar) y, con respaldo
`DEFAULT_STATION_NAME` si AzuraCast no responde.

La segunda fuente es `config.locutor.stationName`, del entorno, que alimenta el
texto del locutor (`timePhrase.service.ts:267`) y el `display_name` del streamer
(`streamer.service.ts:63`). Ese es el que puede divergir sin que nadie lo note:
el nombre que dice la locución en vivo no es necesariamente el que dice la
página.

### 5.6 Otros hallazgos

- `MAX_VIDEO_DURATION_SECONDS` está declarado en el backend y en el worker. La
  copia del worker está muerta: el worker lee `job.maxDurationSeconds`
  (`workerClient.ts:191`), que `jobDispatcher.ts:87` ya manda. Se puede borrar
  del entorno del worker.
- `EMAIL_FROM_NAME` tiene un valor por defecto de `"Gestor de Citas"` y
  `EMAIL_FROM` de `no-reply@gestordecitas.gov.co` en
  `notifications.config.ts:11-12`. Parece un resto de otro proyecto. Moverlo a la
  base no lo arregla, pero conviene revisarlo mientras se toca.
- `getSetting` no puede existir todavía: `AnnouncementSettings` solo se alcanza
  por `getSettings()`, que es asíncrono, mientras que `registerXJob()` es
  síncrono y `startScheduler()` lo llama sin `await` desde `index.ts`. Esa
  asimetría es la que obliga a que la resolución sea un caché y no una lectura
  directa.
- `notifications.config.ts`, `programs.config.ts`, `processing.config.ts` y
  `locutor.config.ts` son literales de módulo, igual que los cuatro sitios de
  5.2. El conjunto real de problemas es "todo `config.*` que sea literal", no
  cuatro casos: casi cada fase necesita convertir su módulo en getters.


## 6. Restricciones

- **SQLite.** No hay enums; los tipos dudosos viven en `packages/types` y en el
  servicio que reconcilia (ver el precedente de `FeedbackMessage` en
  `feedback.service.ts`). La misma regla aplica a los tipos del catálogo.
- **Proceso único.** El backend es un proceso (HTTP + WS). No hace falta
  invalidación entre procesos. Si PM2 pasara a cluster, esto cambia y hay que
  revisarlo antes de migrar un ajuste que se lea en caliente.
- **`config` se importa dinámicamente** en `index.ts` después de resolver
  Infisical, porque cualquier `requiredEnv` lanza en el import. La carga de
  ajustes debe respetar ese orden.
- **TypeScript-first y tipos estrechos.** Un catálogo que devuelve `unknown` no
  sirve; los accesores tienen que devolver el tipo declarado.
- **El frontend tiene `America/Bogota` hardcodeado** en
  `apps/web/src/lib/format.ts:107` y en
  `apps/web/src/pages/admin/AdminPlaybackHistory.tsx:52`. Es deuda ya anotada en
  `docs/frontend-context.md`, y la sección 9 agrava sus consecuencias mientras no
  se arregle. Queda fuera de alcance; ver la sección 12.

## 7. Diseño

### 7.1 Forma de almacenamiento: catálogo tipado sobre tabla genérica

Se descarta una tabla singleton por dominio (siete tablas, cuarenta columnas,
una migración por cada ajuste nuevo) y se descarta la tabla puramente
clave-valor sin validación (perdería los tipos que el proyecto exige).

La forma elegida es **un catálogo tipado en código sobre una tabla genérica**:

```prisma
model StationSetting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt @map("updated_at")
  updatedBy String?  @map("updated_by")

  @@map("station_settings")
}
```

El valor se guarda como texto, igual que en el entorno. El tipo, el rango, la
unidad, la etiqueta y la descripción viven en el catálogo, no en el esquema. La
consecuencia buscada: **agregar un ajuste es un cambio de código en el
catálogo, no una migración**.

El catálogo es la única fuente de verdad para tres cosas a la vez — la
validación del backend, el contrato del endpoint y la forma del formulario — de
modo que no puedan divergir entre sí.

```ts
// La forma de una entrada del catálogo.
interface SettingDefinition<T> {
  key: string;
  section: SettingSection;
  label: string;
  description: string;
  type: "number" | "boolean" | "text" | "emailList";
  defaultValue: T;
  /** Variable de entorno que siembra el valor y queda como respaldo. */
  envFallback?: () => T;
  unit?: string;
  min?: number;
  max?: number;
  /** El acceso devuelve este tipo, no `unknown`. */
  parse: (raw: string) => T;
  format?: (value: T) => string;
  /**
   * El consumidor captura el valor al importar y no lo vuelve a leer, así que
   * cambiarlo desde el panel solo surte efecto al reiniciar. La UI lo dice.
   */
  requiresRestart?: boolean;
  /** No se registra en texto plano en la bitácora de cambios. */
  sensitive?: boolean;
}
```

`envFallback` es una función y no un valor para que la resolución sea perezosa:
el catálogo se construye al importar, mucho antes de que Infisical haya
terminado de cargar, y una llamada directa a `envOr` ahí capturaría el valor
vacío. Es el mismo motivo por el que `health.config.ts` usa getters.

### 7.2 Precedencia y origen visible

La resolución de un ajuste es, en orden:

1. Fila en `station_settings`, si existe.
2. Variable de entorno (`envFallback`).
3. `defaultValue` del catálogo.

La fila gana sobre el entorno, que es lo que hace que el panel sea la fuente de
verdad. Pero eso tiene una consecuencia que hay que mostrar en la interfaz y no
es opcional:

> Una vez que existe la fila, cambiar la variable de entorno deja de tener
> efecto.

Sin mitigación, un operador que edita el `.env` para cambiar algo y ve que nada
cambia va a perder la confianza en el panel. Por eso la respuesta de lectura
incluye el origen de cada valor:

```ts
interface StationSettingValue {
  key: string;
  value: string | number | boolean | string[] | null;
  /** De dónde viene el valor efectivo ahora mismo. */
  source: "panel" | "env" | "default";
  /**
   * `source` describe de dónde se LEE el valor, no qué pasa cuando cambia. Un
   * ajuste con `requiresRestart` se sigue leyendo del caché, pero el caché no
   * lo vuelve a consultar hasta que el proceso arranque otra vez.
   */
  requiresRestart: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}
```

Los dos campos juntos son lo que evita la mentira. `source` evita el "cambié el
`.env` y no pasó nada"; `requiresRestart` evita el "guardé y tampoco pasó nada".
Son problemas distintos y cada uno tiene su propia etiqueta.
```

El formulario muestra una etiqueta junto al campo que diga de dónde viene. Es
la información que convierte "no cambió" en un diagnóstico.

### 7.3 Capa de resolución

Las lecturas ocurren en rutas síncronas (comprobaciones de salud, despacho de
jobs, composición con ffmpeg), así que no se puede esperar a Prisma en cada
lectura. La resolución es un caché en memoria, cargado una vez al arrancar y
actualizado en cada escritura.

```ts
// El caché se hidrata una vez, después de que Prisma esté disponible.
hydrateSettings(): Promise<void>

// Lectura síncrona. Nunca lanza, nunca espera.
getSetting<T>(key: SettingKey<T>): T

// Escritura: valida, persiste y actualiza el caché en el mismo paso.
setSetting(key: string, raw: unknown, updatedBy: string): Promise<void>
```

Puntos que la implementación tiene que respetar:

- **`hydrateSettings` falla suave.** Si Prisma no responde, se registra un
  aviso y el sistema arranca con entorno y defaults. Una radio que emite con los
  valores antiguos es recuperable; una radio que no arranca no lo es.
- **`getSetting` nunca lanza.** Devuelve el default si la clave no existe o si
  el valor guardado no parsea. Un ajuste corrupto no puede tumbar el proceso.
- **La escritura es la única que muta el caché**, y lo hace después de que
  Prisma confirma. Si la escritura falla, el caché no se toca y el panel recibe
  el error.
- **El caché es de lectura concurrente.** Varios jobs leen a la vez; solo el
  endpoint de ajustes escribe, y lo hace desde el handler de HTTP.

El arranque en `backend/src/index.ts` queda, en orden: dotenv, secretos de
Infisical, imports dinámicos de `config`, conexión de Prisma,
`hydrateSettings()`, y recién entonces `startScheduler()` y los servidores. Es
importante que la hidratación ocurra antes del scheduler: un job que arranque
antes de hidratar leería defaults y podría tomar una decisión equivocada en su
primera vuelta.

### 7.4 Cómo se lee un ajuste movido: getters sobre `config.*`

Hay dos formas posibles y conviene fijar una antes de escribir código.

La opción A es que cada consumidor llame `getSetting("programs.loudnessTargetDb")`
en el punto de uso. La opción B es que los módulos de `config/` que alojan un
ajuste movido se conviertan en getters que delegan en el caché, y los
consumidores no cambien.

Se elige **B**, y es la razón principal por la que las fases son viables.

`config.programs.loudnessTargetDb` aparece en `program.audio.service.ts:194-196`,
`config.health.nowPlayingSilenceSeconds` en `health.checks.ts:130`, y así
sucesivamente en más de quince puntos de uso repartidos en seis dominios. Con
A habría que reescribirlos todos, y cada reescritura es un chances de que alguien
olvide un sitio y ese ajuste se quede congelado sin que nadie lo note. Con B el
cambio se concentra en el módulo de configuración y los consumidores no se
tocan.

En la práctica B significa que `health.config.ts`, `programs.config.ts`,
`processing.config.ts`, `notifications.config.ts` y el bloque `tts` de
`locutor.config.ts` pasan de literal a getters, exactamente como ya lo hicieron
`logs.config.ts` y `backups.config.ts`. Cada fase convierte su módulo; es el
trabajo de refactor que esa fase trae consigo.

`getSetting` sigue siendo la única lectura del caché, y `config.*` es la
fachada. No hay dos mecanismos conviviendo: hay una fuente y dos formas de
llegar a ella.

### 7.5 Qué pasa con `AnnouncementSettings`

`AnnouncementSettings` no se borra ni se rehace. Sigue siendo la fila única de su
dominio, con sus límites, su parche parcial y su secreto enmascarado, porque ya
tiene lo que este diseño busca y rehacerlo sería cambiar algo que funciona a
cambio de nada.

Dos aclaraciones que el documento anterior dejaba ambiguas:

- **El catálogo no tiene entradas para las claves de `AnnouncementSettings`.**
  `perHour`, `minGapMinutes`, `bedsDir` y `bedVolume` viven en esa fila, no en
  `station_settings`. No hay un segundo backend de almacenamiento detrás del
  catálogo.
- **La sección Avisos de la página es un enlace** a la pantalla de locutor que ya
  existe, no una segunda copia. Duplicarla sería la forma más fácil de que las
  dos se desincronicen.

La excepción es `timezone`, que sí se mueve, por la razón de la sección 9.

### 7.6 Superficie de API

Montada en `/admin-api/settings`, con `requireAuth` y el permiso nuevo
`settings`.

```
GET  /admin-api/settings              → secciones con valores, origen y metadatos
PUT  /admin-api/settings              → parche parcial { "clave": valor, ... }
POST /admin-api/settings/reset        → vuelve claves a entorno/default
GET  /admin-api/settings/changes      → últimas N modificaciones, con autor
```

`GET` devuelve el catálogo agrupado por sección, no una lista plana. El panel
pinta secciones y el operador no tiene que recordar qué clave era cuál:

```ts
interface StationSettingsResponse {
  sections: Array<{
    id: SettingSection;
    label: string;
    description: string;
    items: StationSettingValue[];
  }>;
}
```

La validación vive en el catálogo y se ejecuta en `PUT`. Un valor fuera de
rango es un `400` con un mensaje que nombra el campo y el rango, no un `clamp`
silencioso. La diferencia importa: el patrón actual de `AnnouncementSettings`
acota con `clampInt` y un `9` enviado a un campo que exige mínimo `10` se
convierte en `10` sin avisar. Para una pantalla de configuración, un clamp
silencioso hace que el operador guarde y no entienda por qué el valor no es el
que escribió.

**Esto aplica solo al endpoint nuevo.** `settings.service.ts:81-89` mantiene su
`clamp`, y el formulario de la pantalla de locutor sigue como está. El panel
tendría entonces dos comportamientos de validación distintos, y eso es
deliberado: cambiar el `clamp` a rejection obliga a revisar primero qué envía
hoy ese formulario, y si hoy envía un valor fuera de rango que el clamp corrige
en silencio, pasarlo a rechazo rompe una pantalla que funciona. Se anota como
trabajo futuro, no se hace dentro de este proyecto.


### 7.7 Interfaz

Una página, `/admin/settings`, con una tarjeta por sección y guardado por
sección. Guardar por sección y no con un único formulario global evita que un
valor malo en un bloque impida guardar los otros.

Las secciones, en el orden en que un operador las recorre:

| Sección | Contenido | Ajuste aplicado en |
|---|---|---|
| Identidad | Nombre de la estación, correo del remitente, nombre del remitente | Fase 6 |
| Salud | Intervalo, silencios, antigüedad de respaldo, disco libre, antigüedad de muestreo, interruptores de correo y push | Fase 1 |
| Avisos | Referencia a la pantalla existente de `AnnouncementSettings`, no duplicada | ya existe |
| Voz | Estabilidad, similitud, modelo, formato de salida, voz por defecto, mapa de voces | Fase 7 |
| Programas | Objetivo de sonoridad, techo, ganancia máxima, gracia de emisión, duración máxima, caducidad de borradores | Fase 3 |
| Procesamiento | Duración máxima de video, reintentos, plazo de trabajo | Fase 4 |
| Notificaciones | Destinatarios de correo, destinatarios de oración, tokens push | Fase 2 |
| Respaldos | Retención diaria y semanal | Fase 5 |

Cada campo lleva etiqueta, descripción, unidad y, cuando aplica, el rango
válido. El origen se muestra junto al valor, y los ajustes con
`requiresRestart` llevan una nota explícita. Las secciones que dependen del
entorno y quedan fuera del alcance no aparecen: no hay una lista de "esto no se
puede cambiar" porque no hace falta y porque invita a intentarlo.

La página es de solo lectura para los valores que vienen del entorno, con un
enlace a la documentación, en vez de un campo editable que se ignora.

### 7.8 Permiso

Se añade `settings` a `AdminPermission`, `ADMIN_PERMISSIONS` y
`ADMIN_PERMISSION_LABELS` en `packages/types/src/admin.ts`, con la etiqueta
"Ajustes". La entrada de navegación va en una sección propia.

`SUPERADMIN` y `ADMIN` lo obtienen en tiempo de ejecución por
`hasAdminPermission`; una fila `USER` necesita una asignación explícita vía
`PATCH /admin-api/users/:id`, igual que pasó con `feedback` y `programs`.

Un solo permiso para toda la página. La alternativa sería separar "ajustes
operativos" de "ajustes de emisión", pero el primer corte resulta arbitrario y
obliga a manejar dos tarjetas de permiso para un cambio de sonoridad.

**Pero ese permiso tiene un problema que este documento no puede resolver solo,
y está en la sección 13.** Hoy la retención de respaldos está detrás de
`requireSuperAdmin` (`backups.routes.ts:19`), y un permiso `settings` que
`hasAdminPermission` concede a cualquier `ADMIN` sería una subida de privilegio
respecto al estado actual.

### 7.9 Auditoría

Cada escritura deja una fila en `station_setting_changes` con la clave, el
valor anterior, el nuevo, el autor y el momento.

La razón es operativa y concreta: "este disco se llenó tres veces por semana
hasta que alguien bajó el umbral" no se puede reconstruir sin un registro de
quién cambió qué.

Dos reglas que hay que decidir al implementar, porque "tabla pequeña" no es una
política de retención:

- **Poda.** Se propone conservar los últimos 500 cambios o 180 días, lo que
  ocurra primero. Sin poda, la tabla crece para siempre y cada copia del
  respaldo diario arrastra en R2 una tabla que nadie consulta.
- **Redacción.** Una clave marcada `sensitive` guarda el valor anterior y el
  nuevo como un marcador, no como texto. Sin esto, la Fase 2 escribiría
  direcciones de correo dos veces —en el ajuste y en la bitácora— en el mismo
  archivo que sube a R2 cada día.

## 8. Secretos

**Ningún secreto entra en `station_settings`.**

El argumento no es solo electrónico. El archivo de SQLite entra en cada
respaldo diario que se sube a R2, y el backend expone endpoints que sirven datos
de oyentes. Un secreto en la base de datos no sale del entorno: pasa a tener una
copia en el archivo, otra en cada respaldo, y un endpoint de lectura que alguien
puede olvidar proteger. El entorno tiene una sola copia y un solo consumidor.

Se quedan en Infisical: `AZURACAST_API_KEY`, `JWT_SECRET`, `PANEL_SECRET`,
`WORKER_AUTH_SECRET`, `WEBHOOK_SECRET`, `FB_VERIFY_TOKEN`, `FB_APP_SECRET`,
`FIREBASE_SERVICE_ACCOUNT_JSON`, `SMTP_PASSWORD`, `BREVO_API_KEY`,
`GEOIP_LICENSE_KEY` y las credenciales `R2_*`.

El caso límite es `ELEVENLABS_API_KEYS`. El plan gratuito da 10.000 caracteres
al mes y un aviso de 100 caracteres produce 6,7 s de audio, así que una sola clave
cubre unos dos días con dos avisos por hora: agregar una clave al pool es una
tarea recurrente, y hoy significa editar Infisical y reiniciar. La página de
estado ya expone el estado por clave y los últimos cuatro caracteres.

Lo que este diseño hace con eso es exponer mejor lo que ya existe, no guardar el
secreto: la Fase 7 mueve los parámetros de ajuste del motor (estabilidad,
similitud, modelo, formato, mapa de voces) al catálogo, y deja las claves en el
entorno. Si más adelante se quiere editar el pool desde el panel, la forma
correcta es una tabla aparte, cifrada, con su propio endpoint y su propio
permiso; meterla en `station_settings` la mezclaría con ajustes que no son
secretos y que el panel lee con frecuencia.

## 9. La zona horaria

Este es el punto más delicado del trabajo y el que ya está roto.

Hoy hay dos fuentes: `AnnouncementSettings.timezone`, editable desde el panel y
usada para calcular el plan (`announcementPlan.service.ts:144`,
`playback.job.ts:82`), y `config.locutor.timezone`, del entorno y usada para
registrar al menos doce jobs, además de `shared/utils/date.ts:79,83`
(`getStationTime`), que usan las rutas de avisos. Editar la primera deja el
sistema con el plan en una zona y los horarios en otra.

Hay un detalle que impide la solución obvia. "Que los crons lean la misma fuente
que el plan" suena directo, pero `AnnouncementSettings` solo se alcanza por
`getSettings()`, que es asíncrono, mientras que `registerXJob()` es síncrono y
`startScheduler()` lo llama sin `await` desde `index.ts`. Hacerlo exigiría volver
asíncrono el registro de jobs o darle a esa fila un acceso síncrono, y las dos
cosas tocan el arranque.

La propuesta sale de esa restricción: **`timezone` deja de ser una columna de
`AnnouncementSettings` y pasa a ser un ajuste del catálogo.**

- Una migración elimina la columna `AnnouncementSettings.timezone`.
- `announcementPlan.service.ts:144` y `playback.job.ts:82` pasan a leer
  `getSetting("station.timezone")`, que es síncrono.
- `shared/utils/date.ts` y los registros de cron leen lo mismo, así que queda
  una sola fuente en todo el backend.
- `envFallback` apunta a `TIMEZONE`, de modo que una instalación que ya define
  la variable no cambia de comportamiento al migrar.

Queda un límite que no se quita: **cambiar la zona horaria sigue exigiendo
reiniciar**, porque `cron.schedule` congela la zona en el registro. El catálogo
lo marca con `requiresRestart` y el panel lo dice. Hacerlo editable en caliente
exige un registro de jobs que pueda desregistrarse, que es el mismo trabajo que
este proyecto necesitaría para las expresiones cron y que conviene hacer una
sola vez para ambos.

## 10. Fases

Cada fase deja el sistema en un estado coherente. Ninguna depende de que la
anterior esté completa para poder arrancarse.

**Fase 0 — Cimiento.** Esquema `StationSetting` y
`station_setting_changes`, catálogo, caché, `hydrateSettings()` en el arranque,
los cuatro endpoints y la página `/admin/settings` con una sección de ejemplo.
Ningún ajuste movido todavía. Sirve para comprobar que la página y los
endpoints funcionan antes de mover nada real.

**Fase 1 — Salud.** Los cuatro umbrales calientes y los dos interruptores.
`health.config.ts` ya usa getters perezosos, así que la conversión al caché es
directa, y `health.checks.ts:130,260,270,345,390` los lee por getter en cada
ciclo: el cambio surte efecto sin reiniciar. Incluye la sección 9 completa,
porque `shared/utils/date.ts` también se toca aquí.

Dos advertencias sobre esta fase:

- `intervalSeconds` **no** va con los otros. `health.job.ts:12-15` lo lee una
  sola vez y lo convierte en la expresión cron `*/N * * * *`, así que es un
  ajuste con `requiresRestart`. Además su dominio real son minutos desde 1, no
  segundos desde 30: la entrada del catálogo no puede decir "segundos" sin
  mentir.
- `diskMinFreePercent` deriva el umbral crítico con `diskMinFreePercent / 2`
  (`health.checks.ts:260`). Bajar el umbral degradado mueve también el crítico,
  y el catálogo tiene que decirlo en la descripción del campo.

**Fase 2 — Notificaciones.** Destinatarios de correo, destinatarios de
oración, tokens push, correo del remitente y su nombre. Es también la fase que
repara el valor heredado de "Gestor de Citas". Requiere convertir
`notifications.config.ts` en getters, que hoy es un literal. La clasificación
como sensible de los tokens push está en la sección 13.

**Fase 3 — Programas.** Objetivo de sonoridad, techo, ganancia máxima, gracia
de emisión, duración máxima y caducidad de borradores. La sonoridad es el ajuste
que más se toca con experimentación real, y hoy está documentado en un
comentario de seis líneas del `.env`. `programs.config.ts` pasa a getters y
`app.ts:213-221` se queda como está, porque el directorio se resuelve al montar.

**Fase 4 — Procesamiento.** Duración máxima de video, reintentos y plazo de
trabajo. `jobDispatcher.ts:12` calcula `DEADLINE_MS` en el ámbito del módulo;
esa línea se mueve a lectura perezosa como parte de la fase.

**Fase 5 — Respaldos.** Retención diaria y semanal. La retención no existe hoy
en TypeScript: solo la lee `scripts/radio-backup.sh:70-71`, y hay dos rutas que
la ejecutan. `backups.service.ts:167` la invoca con `execFileAsync` heredando el
entorno del padre, así que inyectar la variable ahí es directo. La otra es
`backend/src/run-backup.ts`, que es el timer de systemd: un proceso Node aparte
que hoy no abre Prisma. Si esa ruta no lee el ajuste, el respaldo automático
diario seguiría con el valor del entorno mientras el panel muestra el de la base,
que es exactamente el fallo que este diseño quiere evitar. La propuesta es que
también lea, abriendo Prisma para una fila; el proceso ya carga Infisical, así
que no cambia su natureza. Sección 13 lo lista como pendiente de confirmación.

**Fase 6 — Identidad.** `STATION_NAME`. El alcance real es más grande de lo que
parece y está en la sección 13, porque cambiar el nombre no es cambiar una
columna: hoy no existe ningún `PUT` a la estación en todo el backend, el
`display_name` del streamer solo se escribe al crearlo
(`streamer.service.ts:63` corre una vez), el nombre viaja en el claim del JWT y
solo se refresca al iniciar sesión, y el banco de audios ya generados sigue
diciendo el nombre viejo en voz alta a través de `findReusableAudio`.

**Fase 7 — Voz.** Los parámetros de ajuste de `ELEVENLABS_*`. Requiere volver
perezoso `elevenLabs.provider.ts:12-13`, que hoy congela el bloque entero. Las
claves se quedan en el entorno (sección 8).

## 11. Riesgos y casos límite

- **La caché y el reinicio.** Un cambio guardado no sobrevive a un reinicio si
  la escritura falló; la UI muestra el error y el valor efectivo no cambia. Es
  el comportamiento correcto y hay que asegurarse de que la UI lo diga.
- **Procesos múltiples.** El diseño asume un proceso. PM2 en cluster rompería la
  invalidación. No hay que construir pub/sub ahora; sí hay que no migrar ningún
  ajuste leído en caliente sin verificar el modo de arranque.
- **Ajustes leídos en el arranque.** Un ajuste que su consumidor capture al
  importar no se puede cambiar desde el panel, y `requiresRestart` es la única
  forma honesta de decirlo. `azuracast.client.ts`, `jobDispatcher.ts:12` y
  `health.job.ts:12` son los casos; `app.ts:213-221` lo es por otra razón
  (`express.static` resuelve al montar). Por eso `AZURACAST_URL` y las rutas
  quedan fuera.
- **Un valor guardado que ya no parsea.** `getSetting` devuelve el default y se
  registra un aviso. Un ajuste corrupto no puede ser una razón para que la
  radio calle.
- **Un rango que queda obsoleto.** Si el catálogo dice máximo 100 y el dominio
  real no aguanta 100, el panel lo va a dejar pasar. Los límites salen del
  dominio que usa el ajuste, no de copiar los defaults del `.env`.
- **Restaurar un respaldo viejo.** `radio-restore.sh` reemplaza el archivo de
  SQLite, y con él los ajustes. Es lo correcto, y conviene decirlo en el
  documento de restauración para que nadie lo lea como un error.

## 12. Fuera de alcance, explícitamente

Para que nadie lo asuma al ejecutar:

- **La deuda de zona horaria del frontend.** `America/Bogota` está hardcodeado
  en `apps/web/src/lib/format.ts:107` (`stationDayKey`) y en
  `apps/web/src/pages/admin/AdminPlaybackHistory.tsx:52` (`formatMoment`, que es
  una función local de ese archivo, no de `lib/format.ts`). Arreglarlo exige
  exponer la zona de la estación al web app, y eso es un cambio aparte. Se deja
  como está.
- **Las expresiones cron.** Siguen en el entorno. Hacerlas editables necesita
  el registro de jobs que la sección 9 ya identifica como trabajo futuro.
- **`MAX_VIDEO_DURATION_SECONDS` en el entorno del worker.** Está muerto
  (`workerClient.ts:191` lee `job.maxDurationSeconds`), así que se puede borrar
  del ejemplo del worker sin más trámite, pero no es parte de ninguna fase.
- **Las claves de `ELEVENLABS_API_KEYS`.** Sección 8.

## 13. Decisiones que solo puede tomar el equipo

Tres cosas quedaron abiertas porque no son técnicas. Las tres cambian qué se
construye, no cómo.

**13.1 — La retención de respaldos y el permiso `settings`.** Hoy
`backups.routes.ts:19` exige `requireSuperAdmin`. Con un permiso `settings` que
`hasAdminPermission` concede a todo `ADMIN`, un ADMIN podría cambiar cuántos
respaldos se conservan, que es una decisión de coste y de recuperación, no de
emisión. Las opciones son: mantener la sección de Respaldos detrás de
`requireSuperAdmin` aunque el resto de la página use `settings`; subirla
explícitamente y aceptar el cambio; o no mover la retención en absoluto y
dejarla en el entorno. La recomendación es la primera, porque conserva el
privilegio actual y no impide que el resto de la página sea un solo permiso.

**13.2 — Los tokens push y la clasificación de secretos.** La sección 8
argumenta que la base no debe guardar secretos, y la Fase 2 mete
`HEALTH_PUSH_TOKENS` ahí. Un token FCM es una credencial que puede mandar
notificaciones a ese dispositivo. No es un secreto de servidor como
`JWT_SECRET`, pero tampoco es un dato de configuración inocuo. Las opciones
son: guardarlos marcados `sensitive` y redactados en la bitácora; sacarlos de la
base y seguir editándolos en el entorno; o mantener una lista separada de
dispositivos operadores, que es más trabajo y más correcto. La recomendación es
marcarlos `sensitive`.

**13.3 — Si la Fase 6 escribe en AzuraCast.** Hoy el backend no hace ningún
`PUT` a la estación. El `PUT /station/{id}` de AzuraCast espera un objeto
completo, así que mandar solo `name` es un riesgo conocido de vaciar el resto.
Y aunque se resuelva, quedan tres cosas que seguirían diciendo el nombre viejo:
el `display_name` del streamer, el claim del JWT hasta el próximo inicio de
sesión, y el banco de audios ya generados. Las opciones son: (a) la Fase 6 se
limita a la fuente del locutor y acepta que la página siga leyendo AzuraCast;
(b) propagar a AzuraCast con lectura previa del objeto completo, asumiendo el
riesgo del `PUT`; (c) dejar la identidad fuera de este proyecto. La
recomendación es (c): es la única que no promete lo que no puede cumplir, y el
nombre duplicado es un problema real pero no uno que bloquee el resto del
proyecto.

## 14. Qué queda para quien implemente

- Dónde va cada ajuste en el catálogo y con qué rango. La sección 7.1 fija la
  forma; los valores salen de los `LIMITS` de `settings.service.ts` y de los
  checks de salud, no de la sección 7.7.
- El orden real dentro de cada fase. Las fases están pensadas para ser
  entregables por separado, no pasos atómicos.
- Si la sección de voz se agrupa con la de avisos o vive aparte, dado que el
  catálogo ya sabe qué es cada cosa.
