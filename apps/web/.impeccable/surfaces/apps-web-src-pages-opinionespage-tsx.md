---
version: 3
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

## Direction contract (v3, oct 2026)

v1 era una hoja oscura de filetes tan callada que las opciones de motivo no
se leían como opciones. Dos vueltas intermedias probaron material distinto
(papel crema, luego kraft avec oro de lámpara) y el usuario las rechazó:
ninguna superficie clara dentro de una app completamente oscura, y ningún
color añadido que no combine. v3 queda así: la paleta del mundo público no
cambia ni se amplía — la distinción entre elementos viene de jerarquía con
los tokens existentes, no de un segundo acento.

THESIS: El formulario es la carta de la estación dentro del estudio nocturno
índigo: `bg-card`, borde `--border`, filetes uniformes. Lo que la
diferencia de v1 es que cada parte sabe decir qué es: el motivo es un grupo
de píldoras legibles, cada fila enciende su filete en el primario cuando se
le lee, y el memo lateral ordena lo que sucede después. Nada nuevo en el
mapa de color: los acentos son `--primary` (índigo), `--faint`,
`--muted-foreground` y `--destructive`; `--tally` sigue apareciendo una sola
vez en esta página (OnAirStamp) y no se usa como acento.

FORM:
- Motivo: píldoras (`min-h-11`, radio completo) con radio `sr-only` dentro de
  la etiqueta; idle: `border-border` + `text-muted-foreground`; hover:
  `border-primary/40`; elegida: `border-primary/60 bg-primary/10
  text-primary` semibold. El foco visible vive en la píldora.
- Filas (Mensaje/Nombre/Contacto): label mono-meta en `text-faint`, contador
  mono a la derecha, input sin caja, placeholder `text-faint/70`; el filete
  de la fila es su señal: `focus-within:border-primary/60`,
  `aria-invalid`→`border-destructive` con el texto de error en
  `text-destructive` y `aria-live="polite"`.
- Consentimiento: caja cuadrada `border-border`; marcada: primario con check;
  error: `border-destructive`. El texto mantiene la primera persona
  ("los datos que escriba aquí") y enlaza `/info/data-treatment`.
- Botón: `bg-primary text-primary-foreground`, hover `/90`, spinner del
  mismo tinte; acción y nombre coherentes ("Enviar mensaje"/"Enviando").

LAYOUT: `main` es `max-w-5xl`, grid `lg:grid-cols-[minmax(0,1fr)_300px]` con
la hoja a la izquierda (cap `640px` a partir de `lg`) y el memo pegado y
sticky a la derecha: los tres pasos reales numerados 01/02/03 en mono
(numeración permitida: es una secuencia). En móvil se apila igual que v1.

SUCCESS: la misma tarjeta cambia de contenido: sello rojo que se dibuja,
"Ya está al aire" en Instrument Serif delante, y botón fantasma
"escribir otro".

MOBILE (apps/mobile/app/feedback.tsx): espejo nativo con los mismos
principios: sheet de cristal (`Colors.surface` + `surfaceBorder`), membrete
mono, filas hairline `borderGlass` con señales (borde `danger` con error),
motivo como píldoras nativas (idle `Colors.border`, elegida
`Colors.signal` + `signalMuted`, hitSlop 4 sobre una píldora de 40dp para
llegar a 48), inputs en caja suave `surfaceDim` con teclado oscuro,
consentimiento con spring y glyphs verde de éxito (v1), botón primario
índigo y el memo de los tres pasos en el fondo tinta bajo la hoja. Haptics
intactos. Sin tokens agregados.

## Unresolved

- El rojo de error público es `--destructive 0 62.8% 30.6%`, bastante oscuro
  sobre `--card`: la señal es tenue. Subirlo mejoraría contraste, pero es
  un token compartido con todo el sitio; se documenta como deuda, no se
  retoca en esta superficie.
- Sin anti-abuso por IP: los docs del repo advierten que la lógica por IP
  detrás de nginx colapsa. El endpoint público acepta POST sin límite de
  tasa. Sigue siendo una brecha conocida, no un olvido.
- El sello de éxito y el medidor de caracteres siguen siendo geometría
  vectorial (ViewBox + `<rect>`/`<text>`), no ilustración rasterizada.
