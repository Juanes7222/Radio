# Avisos de hora gobernados desde el panel

Fecha: 30 de octubre de 2026
Estado: propuesta, pendiente de aprobación

## 1. Qué está roto hoy, con evidencia

### 1.1 Kokoro es el motor principal

El código pone ElevenLabs primero (`tts.service.ts:20`) y aun así el banco de
audio está lleno de `kokoro:ef_dora`. La cadena se rompe en tres puntos y
ninguno avisa:

1. `elevenLabsProvider.isAvailable()` exige algo más que las claves.
   `isConfigured()` (`elevenLabs.provider.ts:166`) devuelve `false` si no hay
   `ELEVENLABS_VOICE_IDS` ni `ELEVENLABS_DEFAULT_VOICE_ID`, aunque
   `ELEVENLABS_API_KEYS` esté bien puesto. Las plantillas usan etiquetas de
   Kokoro (`ef_dora`, `em_alex`), así que sin ese mapa el proveedor se descarta.
2. El descarte es mudo. `tts.service.ts:73` hace `continue` sin registrar nada y
   `preferredProviderId()` (`tts.service.ts:47`) devuelve `"kokoro"` como si
   fuera una elección.
3. El gasto se dispara antes de que la cuota dure. `nightly.job.ts:14` programa
   `SLOTS_PER_GROUP = 24` durante `DAYS_AHEAD = 2`, así que cada noche intenta
   las 24 horas de dos días, y `hourly.job.ts:91` añade una generación cada hora
   en el minuto 45. Ese material **no se emite**: la playlist "Avisos de Hora"
   (id 17) está deshabilitada y sin franjas, y `playScheduledAnnouncementForHour()`
   (`playback.service.ts:26`) no tiene un solo llamador.

El resultado medible: todas las filas del banco tienen marca de tiempo en el
minuto 45 (la del job horario) o a las 02:30 (la del nocturno). Con dos claves
gratuitas y ~90 caracteres por aviso, el techo real son unas 220 locuciones al
mes, es decir unas 7 al día. El sistema intenta decenas.

### 1.2 Siempre «en punto»

`generateNewAudio()` (`audioGeneration.service.ts:125`) escribe
`minutes !== undefined ? minutes : 0`, y ni el job nocturno ni el horario envían
minutos. El minuto cero produce la frase "en punto" y el nombre
`hora_HH_<epoch>.mp3` que se ve en el banco.

El otro camino, el que emite en vivo (`announcementPlan.service.ts`,
`pickCandidateMinutes`), sí sortea minutos, pero borra el archivo después de
sonar (`playback.job.ts:260`), así que nunca aparece en el banco. Lo que el
operador ve en el banco es siempre el sistema viejo.

La frase del minuto ya está resuelta en `timePhrase.service.ts`: "y cuarenta y
dos", "y cuarto", "y media", "en punto" solo en el cero. Sortear minutos no
degrada el texto.

### 1.3 «Bloqueado: persona en vivo» que nunca se recupera

Medido en la estación el 30 de octubre: `live.is_live` está en `true`,
`streamer_name` es `"La Voz de la Verdad"` y `broadcast_start` corresponde al
29 de octubre a las 21:57. Lleva más de un día ocupado.

La causa es una comparación de identidad:

- La cuenta que usa el locutor automático se llama
  `La Voz de la Verdad - Aviso hora` y su `display_name` es
  `La Voz de la Verdad` (`streamer.service.ts:63` lo escribe al crearla).
  AzuraCast reporta el `display_name`, no el usuario.
- `liveState.service.ts:17` compara contra la constante `"avsisos_auto"` y
  `streamer.service.ts:16` hace lo mismo. El `streamerUser` del panel se ignora.
- `liveIsOwnAnnouncement` queda siempre en `false`, así que el propio locutor se
  lee como humano.
- La rama de seguridad (`playback.job.ts:384`) decide **a propósito** no
  desconectar cuando hay un humano, y por eso deja el socket abierto. Desde
  entonces cada slot se bloquea, reintenta cada cinco minutos y se descarta.

El "MÚSICA" del panel no es la causa: `AnnouncementSettings.tsx:668` concatena el
motivo con la playlist que sonaba. Y MÚSICA no está programada, confirmado
contra las playlists de la estación.

El síntoma que se ve en el panel de AzuraCast —la cuenta del locutor aparece
conectada y no suena nada— es el mismo hecho desde el otro lado: mientras el
harbor esté ocupado, el AutoDJ queda desplazado y la estación puede estar
emitiendo silencio. La metadata sigue mostrando la última canción de MÚSICA
porque nadie la ha reemplazado, que es justo lo que hace que el fallo pase
desapercibido. El puerto ocupado no solo bloquea los avisos: silencia la radio.

### 1.4 Los programas que no consumen su franja

REV JAVIER CARRASCAL está programado 11:00–12:30 de lunes a sábado, pero suele
terminar antes. El plan solo siembra slots en las franjas que la programación
declara libres (`announcementPlan.service.ts:114`), así que si el programa acaba
a las 11:40 esa hora queda perdida aunque la estación esté libre. El estado en
vivo ya permitiría emitir; lo que falta es que haya un slot ahí.

### 1.5 Configuración que el panel no gobierna

- `streamerUser` y `streamerPassword` se guardan en la fila y `streamer.service.ts:41`
  lee `config.locutor.streamerUser`. Son campos muertos.
- El job nocturno y el horario no leen una sola fila de `AnnouncementSettings`.
- No existe ningún número que limite los avisos del día. `perHour` se vuelve a
  regalar en cada replan (`playback.job.ts:398`, cada 15 min) porque
  `buildPlan` no descuenta lo que ya sonó.
- El motor de voz, el mapa de voces y las claves viven solo en el entorno.

## 2. Intención

Que el panel sea la única fuente de verdad de la programación de avisos: cuántos
al día, en qué momentos, con qué motor, con qué voz y con qué cuenta de locutor,
sin editar Infisical ni reiniciar para cambiar el comportamiento.

## 3. Objetivos

1. Un solo camino de emisión, con minutos al azar a lo largo del día completo.
2. Un presupuesto diario de avisos **emitidos**, no de intentos.
3. Reintentos proporcionales al motivo del bloqueo.
4. Identidad del locutor automático correcta y configurable.
5. Motor, voces, parámetros y claves editables desde el panel.
6. Que el panel diga cuánto presupuesto de ElevenLabs queda y cuánto consume la
   cadencia elegida.

## 4. No objetivos

- No se toca la programación de AzuraCast ni la malla de programas.
- No se construye un editor genérico de expresiones cron.
- No se toca la app pública ni la móvil.
- No se mueve `STATION_NAME` a la base: la Fase 6 del diseño de ajustes de
  estación ya cubre eso y tiene su propio alcance.
- No se cambia el texto de las plantillas ni el fraseo del minuto.

## 5. Decisiones tomadas por el equipo

- **La cantidad de avisos se mantiene aunque baje la calidad.** Si la cuota de
  ElevenLabs se agota a mitad de mes, los avisos siguen sonando y los que no
  alcancen salen con Kokoro. El presupuesto diario lo fija el operador, no la
  cuota.
- **Todo es editable desde el panel**, incluidas las claves del proveedor.

## 6. El planificador

### 6.1 Un solo camino

Se retiran `nightly.job.ts`, `hourly.job.ts`, `timeSlotPlanner.service.ts`,
`playScheduledAnnouncementForHour()` y la parte de `audioGeneration.service.ts`
que genera desde el banco. Queda un único productor: el slot, que sintetiza su
propio texto con el minuto real y lo emite por el harbor.

Motivo: un audio pre-generado nombra una hora exacta, así que solo puede sonar en
ese minuto. Reutilizar audio y sortear minutos son incompatibles.

### 6.2 Presupuesto diario de emisiones

Nuevo ajuste `announcements.perDay` (por defecto 12). El contador son las filas
`AnnouncementSlot` con `status = "played"` del día de estación.

- Un slot bloqueado **no** consume presupuesto: se descarta y el replan siembra
  otro más adelante.
- Un slot que falla al sintetizar o al conectar tampoco lo consume.
- `announcements.maxPerHour` (por defecto 2) sigue siendo el techo por hora de
  reloj, para que un día libre no se llene de golpe.
- `announcements.minGapMinutes` (por defecto 20) se mide ahora contra la última
  emisión real del día, no solo entre los candidatos del plan.

### 6.3 Muestreo sobre el día completo

`buildPlan` deja de partir de `freeWindows` y sortea sobre el día entero:

- En el cambio de día (00:01) y al arrancar, se siembran `perDay` minutos
  uniformes entre `activeFrom` y `activeTo`, separados al menos `minGapMinutes`
  y sin superar `maxPerHour` por hora de reloj.
- En cada replan se **conservan** los slots pendientes que todavía están por
  delante y solo se completan los que faltan hasta `perDay`. Antes se borraban y
  se volvían a sortear, lo que regalaba cupo.
- Si a la hora del replan ya no cabe la separación mínima para todos los que
  faltan, se siembran los que quepan. Perder un aviso tarde en el día es
  correcto; amontonarlos no.

Ventaja de fondo: un slot bloqueado cuesta una consulta a AzuraCast y **cero
caracteres**, porque `evaluateLiveState` corre antes de `generateAndPlayNow`
(`playback.job.ts:138-186`). Sortear a ciegas es barato.

`analyzeDay` y `freeWindows.service.ts` se conservan solo para lo que el panel
muestra sobre el día, no como espacio de muestreo.

### 6.4 El estado en vivo es la única compuerta

Se mantienen las dos reglas y su asimetría: primero persona en vivo, después
programa en curso. Un programa que termina antes deja de estar en curso en el
momento en que la estación vuelve a MÚSICA, y ahí el slot se permite. Esa es la
respuesta al caso de REV JAVIER CARRASCAL, y no requiere conocer la duración real.

### 6.5 Reintentos por motivo

`announcements.maxRetries` se parte en dos porque los dos motivos no se parecen:

| Motivo | Reintento | Por qué |
|---|---|---|
| `live_streamer` | ninguno | Hay una persona al aire. Martillar cada cinco minutos solo ensucia la bitácora. |
| `scheduled_program` | `announcements.programRetries`, cada `retryIntervalMinutes` | El programa puede terminar en cualquier momento; el reintento es lo que captura el final anticipado. |
| `unknown` | ninguno | Si no se pudo leer el estado, no se puede afirmar que la ventana siga libre. |

Cuando el reintento se agota, el slot se descarta con su motivo y el replan
siembra otro, sin consumir presupuesto.

### 6.6 Qué ve el operador

La bitácora actual se mantiene. Se corrigen dos cosas de lectura:

- El motivo se lee solo, sin depender de la playlist de contexto. La playlist
  pasa a un segundo plano visual en vez de ir pegada al motivo.
- Cuando un slot se descarta por persona en vivo, la fila dice quién estaba al
  aire, que es el dato que hoy queda escondido en `detail`.

## 7. Identidad del locutor y liberación del puerto

El aviso usa el mismo puerto harbor que un DJ humano. Todo lo que sigue existe
porque dejar ese puerto ocupado no es un aviso perdido: es la estación muda.

### 7.1 Identidad

- La comparación reconoce la cuenta por **usuario y por `display_name`**. El
  conjunto es `{streamerUser configurado, "avsisos_auto", display_name de esa
  cuenta}`.
- `getOrCreateAnnouncementStreamer()` lee el usuario y la contraseña de los
  ajustes del panel, no de `config`.
- Si la cuenta ya existe y no hay contraseña guardada, el servicio falla con un
  mensaje que nombra el ajuste que falta; hoy el error habla de `.env`, que ya no
  será el sitio.
- La contraseña no se devuelve nunca al panel: solo `hasStreamerPassword`.
- Cuando no se puede consultar `nowplaying`, `isOwnAnnouncementLive()`
  (`streamer.service.ts:228`) responde `humanStreamer: "desconocido"`, y esa
  respuesta se trata como "hay una persona": nunca se desconecta. Un fallo de
  red de diez segundos no puede convertirse en un puerto ocupado para siempre.
  Con identidad correcta, un estado ilegible se reintenta y solo se rinde
  dejando constancia, sin bloquear el caso normal.

### 7.2 Antes de cada slot

Antes de sintetizar, el slot comprueba quién ocupa el puerto:

- Si está libre, sigue el camino normal.
- Si lo ocupa la cuenta del locutor automático y no hay un aviso en curso, es un
  socket huérfano de una ejecución anterior: se desconecta y se emite. Sin esta
  regla, un solo aviso mal cerrado bloquea el resto del día.
- Si lo ocupa una persona, se registra y no se toca. Se mantiene la asimetría
  actual y por la misma razón.

La comprobación ya existe a medias en `isOwnAnnouncementLive()`; lo que falta es
usarla antes de emitir y no solo después.

### 7.3 El timeout del stream escala con el archivo

`STREAM_TIMEOUT_MS` es una constante de 30 s (`streamer.service.ts:17`) y corta
la conexión a mitad de un aviso largo, matando el socket con audio dentro. Se
calcula como la duración del archivo más un margen, con un mínimo de 30 s. Un
aviso de 45 s hoy es un puerto colgado.

### 7.4 Vigilancia periódica

Se añade una comprobación al watchdog de salud, que ya corre cada dos minutos y
ya sabe desconectar el live con backoff:

- Si `is_live` está en `true`, el streamer es la cuenta del locutor automático y
  no hay ninguna ejecución de aviso en curso durante más de
  `announcements.stuckLiveMinutes` (por defecto 5), se ejecuta
  `disconnectLiveSource()` y se registra como acción automática.
- Si el streamer no es esa cuenta, no se toca nada: hay una persona.
- El aviso de recuperación se cierra solo cuando `is_live` vuelve a `false`.

Con esto el fallo deja de depender de que alguien mire el panel de AzuraCast.

### 7.5 Botón en el panel

`POST /admin-api/locutor/live/release` desconecta el live únicamente si lo ocupa
la cuenta del locutor automático, y devuelve quién lo ocupaba. El panel lo
muestra junto al estado del locutor, con la misma vara de medir, para que un
operador pueda liberar el puerto sin entrar a AzuraCast. Se registra en la
bitácora con el autor.

## 8. Motor de voz

### 8.1 Sección `voice` del catálogo

El catálogo de ajustes ya existe (`settings.catalog.ts`) con caché síncrona,
auditoría, redacción de secretos y vuelta al entorno. La sección `voice` ya está
declarada en `settings.types.ts` pero vacía; aquí se llena:

| Clave | Tipo | Default |
|---|---|---|
| `voice.provider` | texto: `auto` / `elevenlabs` / `kokoro` | `auto` |
| `voice.elevenLabsModel` | texto | `eleven_multilingual_v2` |
| `voice.elevenLabsStability` | número 0–1 | 0.5 |
| `voice.elevenLabsSimilarity` | número 0–1 | 0.75 |
| `voice.elevenLabsOutputFormat` | texto | `mp3_44100_128` |
| `voice.defaultVoiceId` | texto | vacío |
| `voice.voiceMap` | texto `ef_dora=<id>,em_alex=<id>` | vacío |
| `voice.kokoroUrl` | texto | `http://localhost:8880` |

`voice.provider` es la palanca que hoy no existe: en `auto` se intenta ElevenLabs
y se cae a Kokoro; en `elevenlabs` no se cae (falla, para que un problema se
vea); en `kokoro` se fuerza el motor barato para ahorrar cuota a propósito.

### 8.2 Lectura perezosa

`elevenLabs.provider.ts:12-13` captura `config.locutor.tts.elevenLabs` al
importar el módulo. Con un ajuste de panel eso no sirve: hay que leer en cada
llamada, como ya hace `health.checks.ts`. Es el mismo trabajo que la Fase 7 del
diseño de ajustes de estación describe.

### 8.3 El mapa de voces se valida al guardar

`voice.voiceMap` se parsea como pares `etiqueta=voice_id`. Si el formato no
cierra, el guardado es un 400 con la frase del campo, no un valor a medio
guardar. El panel muestra las etiquetas que las plantillas usan de verdad
(`ef_dora`, `em_alex`) leídas de `AnnouncementTemplate`, para que nadie tenga que
adivinarlas.

### 8.4 Aviso de presupuesto

La sección Voz muestra, junto al campo de cadencia:

- caracteres restantes de cada clave (ya lo expone `getTtsStatus`),
- caracteres que consume la cadencia elegida al mes, calculado con la longitud
  real de las plantillas activas,
- qué porcentaje de los avisos saldrá con ElevenLabs.

Es el único sitio donde el operador puede ver por qué una mañana empezó a sonar
Kokoro sin mirar los logs.

## 9. Las claves desde el panel

### 9.1 Por qué una tabla aparte

La base de SQLite entra en cada respaldo diario que sube a R2
(`scripts/radio-backup.sh`), y el backend expone endpoints que sirven datos de
oyentes. Una clave en `station_settings` tendría copia en el archivo, copia en
cada respaldo y un endpoint de lectura más que proteger. El diseño de ajustes de
estación ya lo dejó escrito en su sección 8: si algún día se editan desde el
panel, la forma correcta es una tabla aparte con su propio endpoint y su propio
permiso. Esto es ese caso.

### 9.2 Cifrado

Tabla `provider_api_keys`: `id`, `provider`, `label`, `ciphertext`, `iv`, `tag`,
`enabled`, `createdAt`, `updatedAt`, `updatedBy`.

Cifrado AES-256-GCM con una clave maestra de 32 bytes en
`SECRETS_ENCRYPTION_KEY` (Infisical). Consecuencia que hay que decir sin
adornos: el panel edita las claves, pero **sin esa variable del entorno no se
pueden descifrar**. Si se pierde, hay que volver a pegar las claves desde el
panel; no se pierde nada más.

Lo que se guarda es un secreto cifrado, así que la lectura del panel devuelve
solo `****últimos4`, igual que ya hace `maskKey()` en `apiKeyPool.service.ts:51`.
El cambio se registra en `station_setting_changes` con el marcador de redacción
que ya existe (`redactForAudit`).

### 9.3 Endpoints y permiso

- `GET /admin-api/settings/voice-keys` — lista enmascarada, con estado de cada
  clave tomado de `getElevenLabsStatus()`. Permiso `settings`.
- `POST /admin-api/settings/voice-keys` — añade una clave. `requireSuperAdmin`,
  por la misma razón que la retención de respaldos: es una decisión de coste.
- `DELETE /admin-api/settings/voice-keys/:id` — retira una clave.
  `requireSuperAdmin`.
- `POST /admin-api/settings/voice-keys/test` — sintetiza una frase corta y dice
  qué motor contestó. Ya existe la lógica en `/test-tts`.

### 9.4 Reconstrucción del pool

`ApiKeyPool` se construye al importar (`elevenLabs.provider.ts:13`) y no tiene
forma de recargarse. Se añade `reloadPool(keys)` que reemplaza las entradas
conservando el estado de las claves que siguen existiendo, y los endpoints llaman
a eso después de escribir. Las claves retiradas se descartan de inmediato.

### 9.5 Semilla del entorno

Para que el despliegue no rompa nada: si la tabla está vacía, el pool se
construye desde `ELEVENLABS_API_KEYS` y el log dice que está en modo heredado.
Un script `pnpm --filter @radio/backend voice-keys:backfill` cifra y copia las
claves del entorno a la tabla. Una vez corrido, la variable se borra de
Infisical, igual que se hizo con los canales de YouTube.

## 10. Una sola fuente de configuración

`AnnouncementSettings` es una fila singleton anterior al catálogo. Mantener las
dos deja dos sistemas de configuración para lo mismo y conserva el fallo que el
diseño de ajustes ya documentó en su sección 9: `timezone` vive en la fila y en
el entorno a la vez.

Se mueve al catálogo:

- `announcements.enabled`, `perDay`, `maxPerHour`, `minGapMinutes`,
  `programRetries`, `retryIntervalMinutes`, `respectLiveStreamer`,
  `respectScheduledPrograms`, `streamerUser`, `bedsDir`, `bedVolume`,
  `trailingSilenceSeconds`, `activeFrom`, `activeTo`, `stuckLiveMinutes`.
- `station.timezone` se resuelve aquí también, y `shared/utils/date.ts` pasa a
  leerla, que es lo que la sección 9 del otro diseño pide.

Una migración copia los valores de la fila a `station_settings` y otra elimina la
tabla. El panel de `/admin/locutor` cambia su formulario a los endpoints del
catálogo; lo que el operador ve no cambia, pero gana bitácora de cambios y la
etiqueta de "viene del panel o del entorno".

`windowEdgeMarginMinutes` y `minWindowMinutes` desaparecen: eran del muestreo por
franjas, que ya no existe.

## 11. El banco que ya existe

- Las filas de `generated_audios` se marcan `expired` en la migración. No se
  borran archivos en caliente.
- Los MP3 subidos a AzuraCast quedan en la biblioteca, bajo `locutores`, y la
  playlist huérfana sigue deshabilitada. Se ofrece un botón de purga en el panel
  que borra archivos y playlist juntos; es destructivo, así que no es automático.
- Las tablas `generated_audios` y `audio_schedules` se quedan mientras haya
  historial que consultar; dejan de escribirse.

## 12. Migraciones

1. `provider_api_keys` (nueva).
2. Copia de `AnnouncementSettings` a `station_settings`.
3. Eliminación de `AnnouncementSettings`.
4. `generated_audios`: todas las filas `ready` pasan a `expired`.

SQLite no renombra preservando índices, así que el orden importa y la copia va
antes del borrado.

## 13. Endpoints nuevos y retirados

Nuevos: los cuatro de `voice-keys` (§9.3), el de purga del banco (§11) y
`POST /admin-api/locutor/live/release` (§7.5).

Retirados: `PUT /admin-api/locutor/settings` y sus hermanos, una vez que el
panel use `PUT /admin-api/settings`. `POST /admin-api/locutor/nightly` y
`hourly` desaparecen con los jobs.

Sin cambios en la app pública.

## 14. Riesgos

- **La vigilancia es la red de último recurso, no la primera.** El watchdog
  tarda hasta dos minutos más el umbral en reaccionar, y en ese tiempo la
  estación puede estar en silencio. Las reglas de §7.2 y §7.3 son las que
  evitan el problema; el watchdog existe para el caso que ninguna de las dos
  cubre.
- **El muestreo a ciegas gasta intentos.** Doce slots al día con dos tercios del
  día programado son unos ocho bloqueos diarios. No cuestan caracteres, pero sí
  ensucian la bitácora. Si molesta, el siguiente paso es ponderar el muestreo
  hacia las franjas no programadas sin excluirlas.
- **Cambiar la zona horaria sigue exigiendo reinicio** (`cron.schedule` congela
  la zona al registrar). El catálogo lo marca con `requiresRestart`.
- **Cifrar sin rotación.** Si `SECRETS_ENCRYPTION_KEY` cambia, las claves
  guardadas dejan de descifrar. El panel lo dice y ofrece volver a pegarlas.
- **Un solo proceso.** Los ajustes viven en una caché de memoria; PM2 en cluster
  rompería la invalidación. Es el mismo límite que el diseño de ajustes ya
  declaró.

## 15. Lo que queda a criterio del constructor

- La forma exacta del algoritmo de muestreo con las tres restricciones a la vez
  (presupuesto, separación mínima, techo por hora).
- El nombre y la forma del campo de franja activa (`activeFrom`/`activeTo` como
  horas enteras o como `HH:mm`).
- Cómo presenta el panel el presupuesto de caracteres cuando hay claves sin
  saldo conocido.
