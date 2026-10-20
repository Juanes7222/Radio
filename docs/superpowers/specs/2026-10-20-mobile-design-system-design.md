# Sistema visual y de experiencia de la app móvil — Diseño (revisión 2)

Fecha: 2026-10-20
Estado: propuesta para revisión
Origen: revisión de diseño externa sobre la app (captura de En vivo, video de pantalla y referencias de apps de audio y de fe), contrastada contra el código de `apps/mobile` y contra la crítica interna del 4 de octubre (`apps/mobile/.impeccable/critique/2026-10-04T15-22-16Z__app.md`).

Esta versión sustituye a la primera (misma fecha, mismo nombre). La diferencia es el alcance: la primera respondió a la paleta y a la tipografía; esta responde a las cuatro pantallas, al movimiento, a la accesibilidad y a la calidad base, y separa lo que ya está hecho de lo que falta.

## 1. Intención y por qué

La app se ve hoy como un reproductor de música oscura genérica: fondo azul noche, acento lavanda pálido y un vinilo girando como pieza central. Los colores son correctos y salen del logo, pero tres cosas la delatan: el escalón de superficie elevada es un gris pizarra que no pertenece a la familia, el acento aparece relleno en botones de 76dp y en cada fila de la lista, y las etiquetas van todas en mayúsculas.

Lo que distingue a esta emisora no es la música: es la voz. Prédicas, lecturas, predicadores y programas. El diseño debe poder decir eso sin inventar assets que no existen.

La restricción es de paleta: se conserva la familia (azul de noche con índigo), el logo, la paridad con la web pública y el rojo de "al aire". No se agrega un color nuevo; se ordenan los que ya están.

## 2. Lo que la app ya cumple

Antes de proponer nada, esto ya está hecho y no hay que tocarlo. La propuesta de la revisión externa se apoya en cosas que la app ya resuelve:

| Propuesta | Estado real | Dónde |
|---|---|---|
| Un solo set de iconos | Ya cumple | Ionicons en los 21 archivos que importan `@expo/vector-icons`; no hay Feather ni MaterialCommunityIcons |
| Cifras tabulares para el temporizador y la hora | Ya cumple | `Typography.mono` y `monoLarge` con `fontVariant: ['tabular-nums']` |
| Quitar el overlay de depuración en producción | Ya cumple | `components/PerfOverlay.tsx` devuelve `null` fuera de `__DEV__` |
| Estados de carga con esqueletos | Cumple en el reproductor | `components/ui/ShimmerBox`; falta en Solicitar, Horarios y Redes |
| Guardar este momento | Ya cumple | El corazón de `PlayerControls` guarda la canción por clave (`hooks/useFavoriteNotify`) |
| Compartir | Cumple en texto | `Share.share` con el título, el artista y el enlace de la app |
| Tamaño de letra ajustable en la Biblia | Ya cumple | `BiblePanel` tiene A−/A+ con su propia escala |
| Carátula a la izquierda de cada canción en Solicitar | Ya cumple | `SongRow` pinta la carátula de 50dp a la izquierda |
| Temporizador con anillo que se vacía | Ya cumple | `SleepTimerBubble` dibuja el arco de progreso real |
| El hook de "reducir movimiento" | Existe | `hooks/useReducedMotion.ts` sigue los cambios del sistema en vivo, pero 77 animaciones de layout no lo consultan |

Esto no es un capricho del revisor: es el punto de partida. La revisión externa recomienda varias cosas que la app ya hizo.

## 3. Paleta

Familia: azul de noche. Tres escalones de superficie y un acento con dos tonos.

| Token | Hoy | Nuevo | Rol |
|---|---|---|---|
| `ink` | `#020817` | `#020817` | Fondo base |
| `backgroundAlt` | `#0F172A` | `#0B1530` | Base bajo el degradado |
| `inkSoft` / `gradientDeep` | `#181C25` | `#121C36` | Escalón medio del degradado |
| `inkElevated` / `backgroundElevated` | `#1F2937` | `#16264D` | Hojas inferiores, tarjetas |
| `border` | `#334155` | `#2A3A5C` | Línea visible |
| `borderGlass` | `rgba(148,163,184,.14)` | `rgba(150,175,225,.14)` | Hairline sobre glass |
| `borderStrong` | `rgba(148,163,184,.24)` | `rgba(150,175,225,.24)` | Agarradera de hoja |
| `signal` | `#8D86F4` | `#8D86F4` | Texto, iconos, anillos, halos, puntos |
| `signalFill` | — | `#7C74F0` | Rellenos con etiqueta (botones, insignias) |
| `scrim` | — | `rgba(2,8,23,0.88)` | Barra inferior de pestañas |
| `scrimStrong` | — | `rgba(2,8,23,0.92)` | Barra de controles del reproductor |
| `scrimSoft` | — | `rgba(2,8,23,0.55)` | Fondo atenuado de la Biblia |
| `inkElevatedFade` | — | `rgba(22,38,77,0)` | La hoja al 0 %; nunca `transparent` |
| `warningGlow` | — | `rgba(246,163,40,0.25)` | Anillo ámbar sobre una superficie rellena |

Regla de aplicación del acento, sin excepciones intermedias: **`signal` para trazos y marcas** (anillo de progreso, halo, puntos de "prédica", borde de la píldora de Biblia) y **`signalFill` para toda superficie rellena que lleva una etiqueta o un glifo encima** (botón de reproducir, botón primario, insignia de respuestas, botón de reintento, tooltip).

### Los textos secundarios dejan de ser pizarra

La revisión señala que "el gris del artista y de 'A continuación' queda justo". El número no era el problema: el gris era. `textMuted` era `#94A3B8`, un pizarra frío sobre un fondo azul, que es exactamente lo que hace que la app se lea como una app de música genérica. Los tokens pasan a azul-gris, conservando o subiendo la luminancia:

| Token | Hoy | Nuevo | Contraste sobre `ink` |
|---|---|---|---|
| `text` | `#F8FAFC` | `#F1F4FA` | 18.2:1 |
| `textSoft` | `#F1F5F9` | `#DCE4F0` | 15.6:1 |
| `textMuted` | `#94A3B8` | `#97A6C0` | 8.1:1 |
| `textFaint` | `#848E9F` | `#7C8AA6` | 5.8:1 |
| `textAltFaint` | `#7A8699` | `#6E7C96` | 4.75:1 |

Todos por encima de AA. La prueba de la tarea 1 los recalcula, así que un token que se rompa falla la suite.

### Las tres decisiones donde el documento y esta revisión discrepan

1. **Azul voz `#3D7BFF` en vez del índigo.** No. El índigo `#8D86F4` sale del logo y es el mismo de la web pública; cambiarlo separaría la interfaz del logo que tiene al lado. El documento dice que el azul sale del logo: el que sale del logo es el índigo. Revertir esta decisión son tres líneas (el token `signal` y sus tres aliases).
2. **Lámpara ámbar para EN VIVO.** No, y el motivo es de casa: el rojo de "al aire" es la convención de la emisora y la usa también el panel web (`OnAirStrip`), de modo que el oyente ve el mismo color para el mismo estado en las dos superficies. El ámbar queda para el temporizador y los avisos, que son los dos trabajos que le corresponden. Además, el propio documento pide que el ámbar sirva para EN VIVO, temporizador y avisos a la vez: tres trabajos en un color es exactamente lo que hay que evitar. Si se quiere la lámpara de estudio, el cambio está acotado a `components/LiveBadge.tsx` y a la insignia de la barra.
3. **Literata y Figtree.** No. Fraunces es una serif de display y Instrument Sans una sans humanista: las dos familias que pide el documento, ya instaladas, con tildes y eñes cubiertos, y compartidas con la web. Cambiarlas rompe la paridad a cambio de nada.

### Literales que quedan de la paleta anterior

Los cuatro `rgba(8,10,30,…)` que quedan en `_layout.tsx`, `(tabs)/index.tsx` y `BiblePanel.tsx` son restos de la paleta vieja (ni siquiera son `ink`). Pasan a `scrim`, `scrimStrong` y `scrimSoft`. Subir la barra de pestañas de 0.72 a 0.88 es además la respuesta a "el texto de la lista se ve por debajo de la barra": el relleno ya era correcto, faltaba opacidad.

Dos literales más arrastran el mismo problema y hay que alcanzarlos en el mismo cambio: el selector de hora de Alarmas (`components/alarm/TimeWheelPicker.tsx`) enmascara su degradado con `#12121f`, que no coincide ni con la hoja actual ni con la nueva, así que el corte se verá; y `AlarmModal.tsx` pinta un ámbar literal `rgba(245,158,11,0.25)` que no es el `warning` de la casa.

### El rojo de "al aire" tiene un solo trabajo, y hoy tiene dos

`Colors.tally` está reservado al estado al aire en toda la app, pero el corazón de favoritos lo usa como "activo" (`PlayerControls.tsx:245`). Pasa a `Colors.success`, que ya significa "confirmado" en la misma pantalla.

## 4. Tipografía

No cambian las familias. Cambia el uso y la escala.

- `Typography.eyebrow` y `Typography.label` dejan de forzar mayúsculas. `letterSpacing` baja de `1.4` a `0.4` y de `0.88` a `0.2`, porque el espaciado amplio existía para compensar las mayúsculas.
- La barra de pestañas pierde `textTransform: 'uppercase'`.
- "Prédica · En vivo" pierde mayúsculas en el reproductor y en Solicitar.
- La escala del documento (28 / 20 / 16 / 13) se adopta sobre la existente: `display` 28 (ya), `screenTitle` 20 (ya), `body` 14 → 16 y `label` 11 → 13. Un cuerpo a 16px en vez de 14 es la diferencia entre una app que se lee de un vistazo y una que se lee con effort; el `caption` de 12 se queda para los metadatos.

## 5. El reproductor

### El sello y el anillo de voz

El documento pide un sello central con carátula y un anillo orgánico, "en lugar del vinilo con anillo de progreso". La app ya tiene el sello: `DialVivo` pinta la carátula en el centro del vinilo (`DialVivo.tsx:299`) y la hace girar con la de la canción. Lo que no tiene sentido en una emisión en vivo es el anillo de progreso: al 62 % de una canción que el oyente no puede buscar, el número no significa nada. Y el vinilo girando dice "música" cuando lo que suena es una prédica.

La versión que se adopta conserva el componente —que es el mejor del repo y el único con movimiento compuesto— y le cambia la semántica:

- **Música:** el disco gira, el anillo muestra el avance de la canción, el centro muestra la carátula. Es el estado actual.
- **Voz:** el disco se detiene, el anillo deja de mostrar avance y respira, y el centro muestra una marca de voz (un micrófono) en vez de una carátula de álbum, porque una prédica no tiene carátula. `isPreaching` ya lo distingue: `DialVivo` baja hoy el halo de 0.42 a 0.18 cuando detecta una prédica.

Es el cambio de mayor rendimiento conceptual con menos código de todo el plan: un reproductor de música se vuelve un reproductor de voz sin assets nuevos.

### La barra superior pasa de cinco elementos a dos

Hoy son cinco: botón de notificaciones, insignia EN VIVO con oyentes, calidad, alarma y temporizador. Cinco elementos en una fila obligan a esconder el contador de oyentes por debajo de 430dp, y la propia barra ya calcula ese umbral.

La barra queda en **EN VIVO** (con el contador de oyentes cuando cabe) y **un botón de opciones**, que abre **una sola hoja** con las cuatro secciones: notificaciones, temporizador, calidad y una fila que abre el editor de alarmas. La hoja es una, con un `ScrollView` y las secciones apiladas; el editor de alarmas sigue siendo su propia hoja, porque configurar una alarma es una tarea, no un ajuste.

La calidad desaparece de la hoja cuando la estación solo expone un mount, que es el caso normal.

### El temporizador vive en un solo lugar

Hoy el temporizador se ve en tres sitios: el icono de la barra, el badge con la cuenta atrás y la burbuja con el anillo. La cuenta atrás además es tick de 5 segundos, así que el `mm:ss` salta de cinco en cinco.

La cuenta atrás vive en la burbuja, con su propio tick de un segundo y su propio estado, de modo que la pantalla del reproductor no se vuelve a renderizar cada segundo. El icono y el badge de la barra desaparecen.

### "A continuación" con miniatura

`playing_next.song.art` existe en el tipo de la API (`packages/types/src/azuracast.ts:106`), así que la miniatura es un dato que ya llega. La tarjeta de "A continuación" la muestra a 40dp.

### La lectura del día

La píldora flotante de Biblia compite con el héroe y no dice nada. En su lugar, al final del contenido, una tarjeta "Lectura de hoy" con los capítulos que la rotación bíblica emitió hoy, alimentada por `GET /api/bible/reading/today` (`BibleReadingToday`, ya existe y es público). Abre la Biblia en ese capítulo. Cuando no hay lectura, no se pinta y la píldora actual queda como respaldo: nada desaparece.

### El error ya dice la verdad

La pantalla de error dice "Reintentamos automáticamente cuando vuelva la señal" y tiene un botón "Reintentar ahora". Eso es correcto: `useAzuraCast` reconecta con esperas de 5, 10, 15, 30 y 60 segundos, y cuando ya hay datos de la estación una falla posterior degrada el estado sin quitar los controles. La observación de la crítica interna del 4 de octubre sobre este punto era válida entonces; el hook se reescribió después. No hay nada que arreglar aquí.

## 6. Solicitar y Oración

**Solicitar.** El botón sólido por fila pasa a acción discreta: borde hairline, texto en `textMuted`. El color queda para el estado pedida (tinte y borde verde, glifo de check), y para el anuncio del lector de pantalla, que pasa de "Pedir X" a "Pedida: X". Al pedir, el botón vibra con la respuesta de éxito y aparece un aviso breve que confirma que la canción entró en la fila: hoy el `Alert` de error y el `ActivityIndicator` del botón son la única confirmación, y no hay ninguno para el caso feliz.

**Oración.** La frase de datos sensibles deja de usar `warning` a 11px. Pasa a `textMuted` a 12/17 con un icono de información en `info`. El error de consentimiento sigue en `danger`: ese sí es un error.

Arriba del formulario, un versículo breve. Sale de la misma fuente que la tarjeta de lectura: los capítulos de hoy y el primer versículo de ese capítulo, con la caché local que ya usa `useBible`. Si no hay lectura o el capítulo no resuelve, no se pinta nada.

Tras enviar, la confirmación serena ya existe; se le añade una línea de acompañamiento.

## 7. Accesibilidad, movimiento y háptica

**Áreas táctiles.** El documento pide 48dp. La app tiene 44dp en las pestañas y las listas, pero la capa de hojas nunca se auditó —la crítica interna del 4 de octubre lo dice y lista los sitios: el control de tamaño de letra de la Biblia (~24dp), los botones de icono de 32dp en la Biblia y su buscador, el "Cancelar" del temporizador (~24dp), los chips de día de las alarmas (38dp) y el escape del reproductor de Facebook (~20dp). Esa capa sube a 48dp.

**Escalado de fuente.** No hay `maxFontSizeMultiplier` en ninguna parte salvo la barra de pestañas, y el texto escala sin límite dentro de geometría fija: el vinilo de 232px y las filas de 44dp del selector de hora. Los textos que viven en cajas de altura fija llevan `maxFontSizeMultiplier` y las cajas pasan de `height` a `minHeight`.

**Movimiento.** El P0 de la crítica interna sigue abierto: hay 77 animaciones de layout y ninguna consulta "reducir movimiento". El modelo está invertido: el usuario que pide menos movimiento pierde el vinilo (inofensivo) y recibe las 49 entradas con desplazamiento a pleno. Reanimated 4 expone `ReducedMotionConfig`, que aplica el ajuste del sistema a todas las animaciones de una vez: es un envoltorio en `app/_layout.tsx`, no setenta ediciones.

**Háptica.** Hoy hay 36 llamadas repartidas sin criterio: `selectionAsync` en casi todo, `impactAsync(Light)` en unos pocos, `notificationAsync(Success)` en tres sitios y `notificationAsync(Warning)` para los errores. La tabla del documento se codifica en un módulo con cuatro respuestas nombradas —tic, clic, éxito y error— y los sitios se alinean a ella.

## 8. Lo que queda fuera, con motivo

| Propuesta | Motivo |
|---|---|
| Notificaciones agrupadas por tipo con el próximo horario | Cada tipo necesita saber a qué hora suena, y el horario por programa no está en la hoja: es un cambio de datos, no de diseño |
| Índice alfabético por artista en Solicitar | La lista es paginada de 25 en 25; un índice A-Z exige el catálogo completo en memoria o un endpoint agrupado |
| Dial Material con esfera para la hora | La rueda actual es una rueda, se reconoce y funciona; construir el dial cuesta mucho para poco. La entrada numérica directa sí es una mejora y queda como trabajo aparte |
| Redes pasa a una pestaña "Más" | Migración de rutas y pérdida del indicador en vivo de la pestaña, que es la señal de que la emisión está en Facebook. Es una decisión de navegación, no de diseño |
| Legal reagrupado y con menos peso | Cosmético, en una pantalla de baja frecuencia |
| Tarjeta para compartir como imagen | Requiere `expo-sharing` y una captura; hoy se comparte texto con enlace a la app |
| Intención o dedicatoria personal | No necesita backend y sería la función "premium" más barata, pero es una función nueva. Es el siguiente paso natural cuando el sistema visual esté en pie |
| Pausar y retroceder en vivo | Depende del servidor |
| Retomar donde te quedaste | Requiere contenido bajo demanda, que la emisora no expone |
| Línea de tiempo en Horarios | El documento la marca como idea a validar; la pantalla de Horarios es un trabajo aparte |
| Modo nocturno cálido en la Biblia | El tamaño ya se ajusta; el modo cálido es una variante de tema |
| Literata y Figtree | Las familias actuales ya son las del tipo que pide el documento, y son las de la web |
| Azul voz `#3D7BFF` | El índigo sale del logo |
| Lámpara ámbar para EN VIVO | El rojo de "al aire" es la convención de la casa, en el móvil y en el panel |

Cuatro afirmaciones de la revisión de origen son incorrectas sobre la app actual y quedan registradas aquí para que nadie las "arregle": el overlay de depuración no llega a producción, Solicitar ya pinta carátula de 50dp, el temporizador ya tiene anillo que se vacía, y la lista de Solicitar ya reserva el alto de la barra: lo que se ve bajo la barra es el contenido a través del desenfoque.

## 9. Riesgos

- La paridad con la web es intencional (`theme.ts` espeja `apps/web/src/index.css`). Este plan cambia solo el móvil, así que web y móvil divergen en los escalones de superficie y en el tono de los textos secundarios hasta que la web adopte lo mismo. Es una divergencia de tono, no de familia.
- `inkElevated` también lo usa `backgroundElevated`. Cualquier tarjeta que ya se leyera como "gris" cambia con él, para bien, pero hay que mirar las hojas de Oración, Alarmas y Biblia en dispositivo.
- La hoja única de opciones toca cuatro componentes a la vez. Es el cambio con más superficie de la revisión; por eso va en su propio plan y no mezclado con el resto.
- Los valores de contraste están calculados a mano con la fórmula WCAG; la prueba los recalcula, así que un cambio futuro de token que rompa AA falla la suite.

## 10. Plan de trabajo

Cuatro planes, cada uno por un subsistema y cada uno dejando software que funciona por sí solo.

| Plan | Alcance |
|---|---|
| `2026-10-20-mobile-visual-system.md` | Tokens de superficie, acento, textos y mayúsculas. No toca componentes. |
| `2026-10-20-mobile-player.md` | Anillo de voz, barra superior y hoja única, temporizador en un lugar, miniatura de "a continuación", lectura del día. |
| `2026-10-20-mobile-solicitar-oracion.md` | Acción de pedir discreta, aviso de datos sensibles neutro, versículo y acompañamiento en Oración. |
| `2026-10-20-mobile-accessibility-motion.md` | Áreas táctiles de 48dp, escalado de fuente, reducir movimiento, háptica coherente, esqueletos de carga. |
