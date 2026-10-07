# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Una sola estación, dos expresiones con lenguaje propio: el sitio público responsive
(`apps/web`) y la app nativa iOS/Android (`apps/mobile`, React Native + Expo). No es
"mobile web": cada una tiene su propio sistema de tokens y su propia familia tipográfica,
y las dos comparten producto, API y voz.

## Users

**Oyente.** Persona en Colombia que escucha la emisora, sobre todo desde el teléfono, a
cualquier hora. Llega desde el reproductor, desde un push de un programa, o desde un
enlace compartido. No tiene cuenta ni sesión. Su trabajo en cada superficie es uno:
escuchar, y cuando tiene algo que decir, decirlo.

**Equipo de la estación.** Operadores en Cartago que administran programación, playlists,
rotaciones, avisos, solicitados y peticiones de oración desde el panel web con
permisos por rol.

## Product Purpose

La Voz de la Verdad es una emisora cristiana pentecostal de Cartago, Colombia, que
transmite 24/7. El producto es la estación completa: el audio, la programación, la
comunidad alrededor de la señal.

En el sitio público y en la app, el trabajo es de **Operate**: escuchar sin fricción y,
cuando hace falta, enviar un mensaje. En el panel, es de **Operate** también, a mayor
densidad y con permisos.

Éxito = la gente oye, y la estación recibe lo que la gente piensa de la estación.

## Positioning

Transmisión perpetua de una iglesia pentecostal de barrio en Cartago, con programación
real (rotaciones de lectura bíblica, programas con locución y pistas, pedidos de
canciones de los oyentes) y no una playlist genérica. El oyente no consume un
catálogo: entra a una emisión que ya está pasando y puede intervenirla.

## Operating Context

- Emisión continua: el estado "al aire" es un hecho operativo permanente, no un evento.
  Existe una luz de tally roja en el producto, reservada exclusivamente para ese estado.
- La lectura bíblica diaria se deriva de la última rotación ejecutada; puede no existir
  para un día dado.
- La estación recibe volumen humano por tres canales ya establecidos: **solicitado**
  (canción), **oración** (petición) y ahora **opinión** (sugerencia, felicitación,
  solicitud, informe). Los tres son públicos, anónimos por defecto y moderados por el
  equipo antes de cualquier respuesta.
- Responderse a un oyente es trabajo humano del equipo, no automatizado.

## Capabilities and Constraints

- Sin autenticación para el público. La identidad del oyente es un `deviceId` local
  (UUID generado en el dispositivo), que actúa como capacidad de propiedad, nunca como
  identidad verificada.
- Datos personales: la Ley 1581 de 2012 obliga a informar el tratamiento. Existe el
  documento público `/info/data-treatment` y es el único con `requiredInApp: true`, de
  modo que cualquier formulario que recoja datos debe enlazarlo.
- El sitio es una SPA servida en un único origen por nginx: mismo origen para
  `/api`, `/admin-api`, `/live-status` y `/live-relay`. El CORS no aplica en producción.
- Contenido de la portada y de la programación se trae de la API en runtime; no se
  prerenderiza.
- copie del panel: todo en español, tono llano, sin emojis.
- El veto del usuario no está resuelto en las tres submissions existentes: anónimo con
  nombre y contacto opcionales es la decisión confirmada para **opinión**.
- Confirmado: las opiniones **no** se publican. Viven en la bandeja interna del equipo.
  No hay muro público, no hay testimony wall, no hay contenido generado por oyentes
  visible en el sitio.

## Brand Commitments

- Nombre: **La Voz de la Verdad**. Iglesia Cristiana Pentecostal, Movimiento Misionero
  Mundial.
- Idioma: español (es-CO). Fecha y hora en zona `America/Bogota` (UTC-5).
- Identidad: índigo profundo, azul de logo. El rojo de tally (353 75% 58%) está
  **reservado** para en-vivo/al-aire y no se usa como acento decorativo en ninguna
  superficie.
- El panel de administración tiene un tema propio ("studio night", ámbar de señal). No se
  mezcla con el tema público índigo.
- Voz: el equipo se dirige al oyente de tú a tú y en voz baja. Sin entusiasmo de
  marketing, sin superlativos, sin emojis.

## Evidence on Hand

- Identidad y logo: `apps/web/public/`, `packages/assets/img/`.
- Contenido real: programación (`/api/schedule`), lectura del día
  (`/api/bible/reading/today`), estado de la señal (`/api/health/public`).
- Piezas existentes de emisión: `VinylDisc.tsx`, `WaveformVisualizer.tsx`,
  `LiveBadge.tsx`, `OnAirStrip.tsx`, `.animate-tally`.
- Copia real de la estación: los templates del locutor, los avisos, los rótulos de
  programa.
- **No hay** testimonios, cifras de audiencia, premios, logos de terceros ni
  métricas que no existan en la base de datos. Nada de esto debe inventarse.

## Product Principles

1. **La señal primero.** Si la estación está Broadcasting, todo lo demás es secundario.
2. **Escribir no cuesta identidad.** Ninguna submission exige nombre ni contacto.
3. **El equipo responde, la máquina no.** Nada generado por oyentes se publica ni se
   responde automáticamente.
4. **Honestidad por omisión.** Si la estación no sabe, no inventa estados ni cifras.
5. **Una sola prueba de diseño, no tres.** El sitio y la app cuentan la misma historia
   con dos voces tipográficas distintas, no con dos productos distintos.

## Accessibility & Inclusion

- Objetivo táctil mínimo 44px en el sitio (regla global; se resetea dentro del panel).
- Todo control expone `accessibilityRole`, `accessibilityLabel` y `accessibilityState`.
- Los mensajes de error de campo son texto vivo (`accessibilityLiveRegion="polite"`), no
  solo color.
- `prefers-reduced-motion` respetado en ambas superficies.
- La app es el canal principal en condiciones de conexión pobre; la web es el canal de lectura
  larga. Ninguna función es exclusiva de una de las dos.