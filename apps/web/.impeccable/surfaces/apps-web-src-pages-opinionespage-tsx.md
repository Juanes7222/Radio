---
version: 1
slug: "apps-web-src-pages-opinionespage-tsx"
primary_target: "apps/web/src/pages/OpinionesPage.tsx"
related_targets: ["apps/mobile/app/feedback.tsx"]
---

# Surface brief — /opiniones (web pública)

Scope: `apps/web/src/pages/OpinionesPage.tsx` y su ruta.
Related target: `apps/mobile/app/feedback.tsx` (misma tarea, tokens nativos).

Visitor mode: Operate, con una invitación a Persuade en el primer viewport.
La tarea es escribir y entregar un mensaje. La prueba de que tiene sentido
es que se envíe sin pedirle ningún dato a cambio.

Audience: oyente en Colombia, casi siempre desde el teléfono, a cualquier hora.
Job: contarle algo a la estación que no cabe en un solicitado ni en una oración.
Acción: enviar el mensaje. Contenido: texto libre hasta 800 caracteres, motivo,
y opcionalmente nombre y contacto. Restricción dura: no se publica nada.

Decisiones confirmadas por el usuario (no reabrir):
- Anónimo con nombre y contacto opcionales.
- Bandeja interna solamente. Sin muro público, sin testimonios, sin cifras.
- Voz clara y sobria: tuteo, sin regionalismos, sin diminutivos.
- Ubicación en mobile: tarjeta dentro de la pestaña Redes, no sexta pestaña.

## Direction contract

THESIS: La página es una carta, no un formulario. La estación recibe
correspondencia: el oyente escribe en una hoja y la entrega. El verbo es
escribir, no "enviar un formulario". Lo que rechaza es el patrón de formulario
genérico — cajas apiladas, píldoras de opción, tarjeta con botón al pie y un
check de consentimiento perdido abajo.

OWN-WORLD: El mundo visual ya está fijado y no se toca. Índigo profundo
(`--background 222.2 84% 4.9%`), Instrument Serif para el saludo y para la
confirmación, IBM Plex Sans Variable para etiquetas y cuerpo, IBM Plex Mono
solo donde hay medición real: contador de caracteres, fecha de recepción y
numerales de la secuencia. Un solo color de estado: `--tally 353 75% 58%`,
reservado por el sistema a "al aire", y usado exactamente una vez, en el sello
del éxito.

STORY: Que cualquiera puede hablar con la emisora sin entregar su identidad, y
que hay alguien real al otro lado leyendo. La página promete exactamente lo que
el backend cumple: llega a una bandeja, y no se publica.

FIRST VIEWPORT: Saludo en Instrument Serif a `clamp(2.2rem, 5vw, 3.5rem)`, con
peso, sin degradado y sin eyebrow encima. Debajo, una entradilla de 65ch en
`text-muted-foreground`. Debajo de la entradilla, la hoja: membrete en mono
(nombre de la estación a la izquierda, "Cartago, Colombia" a la derecha) y
filetes `border-border` de 1px que separan cada fila. La hoja no lleva sombra:
solo borde. El botón de envío vive al pie de la hoja, alineado a la derecha.

FORM: "La carta". Hoja única vertical, ruled rows, sin inputs en caja, sin
píldoras, sin sombra. Posición en la lista de tres estructuras: la elegida por
el usuario. Seed: sin concept-seed (superficie preciso, no página abierta).

## Unresolved

- El sello de éxito y el medidor de caracteres son geometría vectorial
  (ViewBox + `<rect>`/`<text>`), no ilustración rasterizada. Si en la revisión
  se lee como disfraz, cae el sello y vuelve una tarjeta de confirmación.
- Sin anti-abuso por IP: los docs del repo advierten que la lógica por IP detrás
  de nginx colapsa. El endpoint público acepta POST sin límite de tasa. Es una
  brecha conocida, no un olvido.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance
