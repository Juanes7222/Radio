# Sistema visual de la app móvil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner la paleta y la tipografía de la app móvil en la familia azul de noche que ya usa la web, con el acento dividido entre trazos y rellenos, los textos secundarios en azul-gris y las etiquetas en mayúscula de oración.

**Architecture:** Todo vive en `apps/mobile/constants/theme.ts`. Las hojas inferiores, las tarjetas y las superficies altas cambian de color sin tocar un solo componente, porque ya leen el token elevado; el resto del trabajo es reemplazar los literales que quedaron de la paleta anterior por tokens y aplicar la regla del acento. La tipografía son dos tokens y tres sitios que fuerzan mayúsculas a mano.

**Tech Stack:** React Native 0.86 + Expo 57, Reanimated 4.5, Vitest 4 (entorno node), TypeScript estricto, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-20-mobile-design-system-design.md`, secciones 3, 4 y 7 (literal de `tally`).

Este plan es el primero de cuatro y no depende de los otros tres. Los tres siguientes (reproductor, Solicitar/Oración, accesibilidad y movimiento) consumen los tokens que este produce.

## Global Constraints

- Sin dependencias nuevas de runtime ni de desarrollo.
- Ningún color literal en componentes. La paleta vive en `apps/mobile/constants/theme.ts`. Excepciones permitidas y existentes: las marcas de cada red en `app/(tabs)/social.tsx`, los colores del reproductor embebido en `components/FacebookLivePlayer.tsx` y las paradas del SVG del vinilo en `components/player/DialVivo.tsx`.
- Los comentarios, JSDoc y descripciones de funciones se escriben en inglés (AGENTS.md). El copy que ve el oyente va en español y en mayúscula de oración.
- Área táctil mínima en todo control que se toque. Ningún cambio de este plan puede reducirla.
- Las pruebas son Vitest con `environment: "node"` y `include: ["tests/**/*.test.ts"]` (`apps/mobile/vitest.config.ts`), así que no hay runtime de React Native. La lógica pura se prueba importando el módulo; el cableado entre componentes se prueba como prueba de fuente con `readFileSync`, igual que `apps/web/tests/bumpers/upload-inputs.test.ts`.
- En esta máquina PowerShell bloquea `pnpm.ps1`. Todos los comandos se ejecutan como `cmd /c "cd apps\mobile && pnpm ..."`.
- Línea base verificada antes de empezar: `pnpm test` da 1 archivo y 4 pruebas en verde, y `pnpm exec tsc --noEmit` no imprime nada. Cualquier rojo posterior es del cambio.

## Review Focus

1. **Un texto sobre el relleno nuevo.** Al profundizar el índigo de relleno, los textos de 13px que van encima (`textOnSignal`) pueden caer por debajo de AA. Prueba de contraste en Task 1.
2. **Los textos secundarios no pueden volver a ser grises.** El motivo del cambio de `textMuted` no es el contraste sino el tono: un gris pizarra sobre un fondo azul es lo que hace que la app se lea como una app de música genérica. La prueba de Task 1 lo fija comprobando que el canal azul de cada token es mayor que el rojo.
3. **El cuerpo a 16px mueve geometría.** `Typography.body` pasa de 14 a 16 y `label` de 11 a 13: es el cambio de este plan con más probabilidad de desbordar una caja de altura fija. Revisión en dispositivo en Task 1, Step 7.
4. **El rojo de "al aire" tiene un solo trabajo.** El corazón de favoritos usaba `tally`, que en toda la casa significa "en el aire". Si vuelve a usarlo, dos estados distintos se pintan igual. Prueba de fuente en Task 1.
5. **Las cuatro marcas en mayúsculas se quedan.** `EN VIVO`, el sello `AL AIRE`, la cabecera mono de Opiniones y el folio de la Biblia son marcas o folios, no etiquetas. La prueba de Task 2 los fija para que nadie los "corrija".

---

### Task 1: Tokens de superficie, acento, texto y scrims

**Estado:** ejecutada el 2026-10-20 en el commit `747b004`. La escala tipográfica se movió a la Task 2: los dos cambios tocaban los mismos tokens y, por separado, dejaban etiquetas de 13px en mayúsculas, que es un estado que no existe en ninguna parte del producto.

Esta tarea no cambia comportamiento: mueve valores y elimina los literales que quedaron de la paleta anterior. Las hojas inferiores cambian de color sin tocarlas, porque `AppBottomSheet` ya lee `Colors.inkElevated`.

**Files:**
- Modify: `apps/mobile/constants/theme.ts` (superficies, bordes, señal, textos, tipografía) y añadir `signalFill`, los tres scrims, `inkElevatedFade` y `warningGlow`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (literales `rgba(8,10,30,…)`)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (literal `rgba(8,10,30,0.92)` y el botón de reintento)
- Modify: `apps/mobile/components/bible/BiblePanel.tsx` (literal `rgba(8,10,30,0.55)`)
- Modify: `apps/mobile/components/alarm/TimeWheelPicker.tsx` (máscara `#12121f`)
- Modify: `apps/mobile/components/AlarmModal.tsx` (ámbar literal `rgba(245,158,11,0.25)`)
- Modify (rellenos del acento, ver Step 5): `components/PlayerControls.tsx`, `components/player/PlayerTopBar.tsx`, `app/(tabs)/prayer.tsx`, `app/(tabs)/request.tsx`, `app/feedback.tsx`, `app/prayer-history.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/_layout.tsx`, `components/NotificationsModal.tsx`, `components/NoticeOverlay.tsx`, `components/AlarmModal.tsx`
- Modify: `apps/mobile/components/PlayerControls.tsx` (el corazón de favoritos deja de usar `tally`)
- Test: `apps/mobile/tests/design/palette.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `Colors.signalFill`, `Colors.scrim`, `Colors.scrimStrong`, `Colors.scrimSoft`, `Colors.inkElevatedFade`, `Colors.warningGlow`, y los valores nuevos de `inkElevated`, `backgroundElevated`, `backgroundAlt`, `inkSoft`, `gradientDeep`, `border`, `borderGlass`, `borderStrong`, `text`, `textSoft`, `textMuted`, `textFaint`, `textAltFaint`, más `Typography.body` a 16px y `Typography.label` a 13px. Los otros tres planes consumen estos tokens por nombre.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/palette.test.ts`. El helper de contraste y las rutas siguen el patrón de `apps/web/tests/bumpers/upload-inputs.test.ts` (resolver rutas desde `import.meta.url`, no desde `process.cwd()`):

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Colors } from '../../constants/theme';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

function channel(hex: string, index: number): number {
  const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('mobile palette', () => {
  it('keeps the night-blue family and earns the accent split', () => {
    expect(Colors.ink).toBe('#020817');
    expect(Colors.inkElevated).toBe('#16264D');
    expect(Colors.backgroundElevated).toBe(Colors.inkElevated);
    expect(Colors.signal).toBe('#8D86F4');
    expect(Colors.signalFill).toBe('#7C74F0');
    expect(Colors.tally).toBe('#E44456');
  });

  it('keeps AA contrast for the text that sits on each surface', () => {
    expect(contrast(Colors.textOnSignal, Colors.signalFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.text, Colors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.textMuted, Colors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.textFaint, Colors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(Colors.textAltFaint, Colors.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the secondary text blue-grey instead of slate', () => {
    expect(Colors.text).toBe('#F1F4FA');
    expect(Colors.textMuted).toBe('#97A6C0');
    expect(Colors.textFaint).toBe('#7C8AA6');
    expect(Colors.textAltFaint).toBe('#6E7C96');

    for (const token of [Colors.textMuted, Colors.textFaint, Colors.textAltFaint]) {
      expect(channel(token, 2)).toBeGreaterThan(channel(token, 0));
    }
  });

  it('has no leftover literals from the previous palette', () => {
    const files = [
      'app/(tabs)/_layout.tsx',
      'app/(tabs)/index.tsx',
      'components/bible/BiblePanel.tsx',
    ];
    for (const file of files) {
      expect(read(file)).not.toMatch(/rgba\(8,\s*10,\s*30/);
    }
  });

  it('keeps the alarm wheel mask and glow on the sheet surface', () => {
    expect(read('components/alarm/TimeWheelPicker.tsx')).not.toMatch(/#12121f/i);
    expect(read('components/AlarmModal.tsx')).not.toMatch(/rgba\(245,\s*158,\s*11/);
  });

  it('reserves the on-air red for the on-air state', () => {
    const controls = read('components/PlayerControls.tsx');

    expect(controls).not.toMatch(/isFavorite \? Colors\.tally/);
    expect(controls).toMatch(/isFavorite \? Colors\.success/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/palette.test.ts"`
Expected: FAIL en las seis pruebas. La primera falla en `inkElevated` (`#1F2937`), la segunda en `textOnSignal` sobre `signalFill` (`Colors.signalFill` es `undefined` y el helper lanza al parsear), la tercera en `text`, la cuarta en los tres archivos, la quinta en la máscara del selector de hora y la sexta en el corazón. En este punto el archivo de prueba tampoco compila con `tsc`, porque referencia tokens que aún no existen: es esperado y se cierra en el Step 3.

- [ ] **Step 3: Aplica los valores en `constants/theme.ts`**

Cambia exactamente estos valores, conservando el resto del archivo y el orden actual:

```
backgroundAlt: '#0B1530'
inkSoft: '#121C36'
gradientDeep: '#121C36'
inkElevated: '#16264D'
backgroundElevated: '#16264D'
border: '#2A3A5C'
borderGlass: 'rgba(150,175,225,0.14)'
borderStrong: 'rgba(150,175,225,0.24)'
text: '#F1F4FA'
textSoft: '#DCE4F0'
textMuted: '#97A6C0'
textFaint: '#7C8AA6'
textAltFaint: '#6E7C96'
```

Añade, después de `signalFaint`:

```
signalFill: '#7C74F0', // filled accent surfaces; signal stays for strokes, rings and marks
scrim: 'rgba(2,8,23,0.88)', // tab bar
scrimStrong: 'rgba(2,8,23,0.92)', // player control bar
scrimSoft: 'rgba(2,8,23,0.55)', // bible modal backdrop
inkElevatedFade: 'rgba(22,38,77,0)', // the sheet surface at zero alpha; never 'transparent'
warningGlow: 'rgba(246,163,40,0.25)', // warning ring on a filled surface
```

`inkElevatedFade` existe porque un degradado hacia `'transparent'` interpola por negro y deja una banda gris; el mismo RGB con alfa cero es lo único que se desvanece sin ensuciar. `warningGlow` recoge el ámbar que `AlarmModal` tenía escrito a mano.

En `Typography`: nada en esta tarea. La escala (cuerpo 16/23, etiqueta 13/17, caption 12/17) y el caso van en la Task 2, que es la que lleva la tipografía.

Actualiza el comentario de cabecera del archivo: sigue espejando la web en `ink`, `signal`, `tally` y los semánticos, pero los escalones de superficie y los tonos de texto son ahora propios del móvil hasta que la web adopte lo mismo.

- [ ] **Step 4: Ejecuta la prueba de paleta**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/palette.test.ts"`
Expected: las dos primeras en PASS, la tercera en FAIL (los textos son los viejos), la cuarta en FAIL con `rgba(8, 10, 30`, la quinta en FAIL con `#12121f` y la sexta en FAIL porque el corazón sigue en `tally`.

- [ ] **Step 5: Sustituye los literales y los rellenos del acento**

En `_layout.tsx`: el `borderColor: 'rgba(8,10,30,0.9)'` del `dot` y del badge pasan a `Colors.scrimStrong`; el `backgroundColor: 'rgba(8,10,30,0.72)'` del `tabBarBackground` pasa a `Colors.scrim`. En `(tabs)/index.tsx`: el `backgroundColor: 'rgba(8,10,30,0.92)'` de `bottomSection` pasa a `Colors.scrimStrong`. En `BiblePanel.tsx`: el `'rgba(8,10,30,0.55)'` pasa a `Colors.scrimSoft`.

En `TimeWheelPicker.tsx`, los dos degradados pasan a `[Colors.inkElevated, Colors.inkElevatedFade]` y `[Colors.inkElevatedFade, Colors.inkElevated]`, para que la máscara sea exactamente la superficie de la hoja que está detrás. En `AlarmModal.tsx`, `'rgba(245,158,11,0.25)'` pasa a `Colors.warningGlow`.

Después, rellenos del acento. La regla es una sola: **`signalFill` en superficies rellenas que llevan una etiqueta o un glifo encima; `signal` se queda en halos, puntos, anillos y marcas.** Los sitios a cambiar son los del bloque "Modify" de esta tarea, más el `borderColor: Colors.signal` del chip activo de `AlarmModal`. Se quedan en `signal`, sin tocar: el halo de `DialVivo.tsx:214`, el halo de `ConnectingDial.tsx:112`, los dos puntos de `NowPlayingInfo.tsx:183,189` y el disco del icono `addIconWrap` de `AlarmModal.tsx:445`, que es una marca encima del relleno.

En `PlayerControls.tsx`, el glifo del corazón pasa de `Colors.tally` a `Colors.success` cuando la canción está en favoritos.

- [ ] **Step 6: Ejecuta la suite completa y el verificador de tipos**

Run: `cmd /c "cd apps\mobile && pnpm test"`
Expected: PASS, 2 archivos (el de SSE y el nuevo), 10 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 7: Revisa en dispositivo**

Las hojas de Temporizador, Calidad, Alarmas, Notificaciones, Oración y Biblia cambian de color sin que su código cambie. Abre las seis y confirma que ninguna tarjeta interior se pierde sobre el nuevo `#16264D`, que las hairline siguen visibles y que el selector de hora de Alarmas ya no muestra un corte horizontal donde empieza el degradado —ese corte ya existe hoy con los colores viejos, y este cambio lo cierra—.

Después revisa las seis pantallas con texto más grande: Solicitar (filas), Oración (formulario y botones), Horarios (filas y chips de día), Alarmas (chips y filas), Notificaciones (filas) y el reproductor (título, artista, botón de reintento). Ninguna fila debe cortar su texto ni empujar un botón fuera de la caja. Este paso no produce archivo; si algo se rompe, el arreglo es el token o el `minHeight` del componente, no un `numberOfLines` de recorte.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/constants/theme.ts apps/mobile/tests/design/palette.test.ts apps/mobile/app apps/mobile/components
git commit -m "refactor(mobile): order the night-blue palette and split the accent fill from its strokes"
```

---

### Task 2: El kicker desaparece, la escala sube y las etiquetas dejan de gritar

**Estado:** ejecutada el 2026-10-20 en el commit `747b004`, junto con la Task 1 (mismos archivos).

Tres cambios en una sola tarea porque van juntos: la escala tipográfica sube al piso de 16px del cuerpo, las etiquetas dejan de forzar mayúsculas, y el kicker sobre los títulos se elimina en vez de reescribirse. Una etiqueta sobre un título es el recurso por defecto de las plantillas, no un recurso de diseño: el título habla solo y lo que la etiqueta añadía ahora vive en el subtítulo, que las cuatro pantallas ya tenían.

Las cuatro marcas que sí son mayúsculas —`EN VIVO`, el sello `AL AIRE`, la cabecera mono de Opiniones y el folio de la Biblia— se quedan, y la prueba las fija para que nadie las "corrija" después.

**Files:**
- Modify: `apps/mobile/constants/theme.ts` (`Typography.body`, `bodyStrong`, `label`, `caption`, `captionStrong`; se elimina `Typography.eyebrow`)
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (`tabBarLabelStyle`)
- Modify: `apps/mobile/components/player/NowPlayingInfo.tsx` (`preachingBadgeText`)
- Modify: `apps/mobile/app/(tabs)/request.tsx` (`preachingBadge`)
- Modify: `apps/mobile/components/ui/ScreenHeader.tsx` (se elimina el prop `eyebrow`)
- Modify: `apps/mobile/app/(tabs)/request.tsx`, `prayer.tsx`, `schedule.tsx`, `social.tsx` (se quita `eyebrow=` de las cuatro cabeceras)
- Modify: `apps/mobile/app/prayer-history.tsx`, `app/prayer/[id].tsx`, `app/(tabs)/social.tsx`, `components/NotificationsModal.tsx` (`Typography.eyebrow` → `Typography.label`)
- Test: `apps/mobile/tests/design/type-casing.test.ts`

**Interfaces:**
- Consumes: nada de la Task 1 (solo tokens de color).
- Produces: `Typography.body` y `bodyStrong` a 16/23, `Typography.label` a 13/17 con `letterSpacing: 0.3`, `Typography.caption` y `captionStrong` a 12/17 con `letterSpacing: 0.1`. `Typography.eyebrow` desaparece: sus usos pasan a `Typography.label`, porque un rol de etiqueta en mayúscula y otro de etiqueta en minúscula son el mismo rol. `ScreenHeader` queda con `{ title, subtitle }`.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/type-casing.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Typography } from '../../constants/theme';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('sentence-case labels', () => {
  it('stops the type tokens from forcing uppercase', () => {
    expect(Typography.label).not.toHaveProperty('textTransform');
    expect(Typography.body).not.toHaveProperty('textTransform');
    expect(Typography.caption).not.toHaveProperty('textTransform');
  });

  it('keeps the body at the 16px floor and the label at 13', () => {
    expect(Typography.body.fontSize).toBe(16);
    expect(Typography.label.fontSize).toBe(13);
  });

  it('drops uppercase from the tab bar and the preaching badges', () => {
    expect(read('app/(tabs)/_layout.tsx')).not.toMatch(/textTransform: 'uppercase'/);
    expect(read('components/player/NowPlayingInfo.tsx')).not.toMatch(/textTransform: 'uppercase'/);
    const request = read('app/(tabs)/request.tsx');
    expect(request).not.toMatch(/textTransform: 'uppercase'/);
    expect(request).toMatch(/Prédica/);
  });

  it('has no kicker above a heading', () => {
    const header = read('components/ui/ScreenHeader.tsx');

    expect(header).not.toMatch(/eyebrow/);
    for (const file of [
      'app/(tabs)/request.tsx',
      'app/(tabs)/prayer.tsx',
      'app/(tabs)/schedule.tsx',
      'app/(tabs)/social.tsx',
    ]) {
      expect(read(file)).not.toMatch(/eyebrow=/);
    }
  });

  it('keeps the marks that are deliberately uppercase', () => {
    expect(read('components/LiveBadge.tsx')).toMatch(/EN VIVO/);
    expect(read('app/feedback.tsx')).toMatch(/textTransform: 'uppercase'/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/type-casing.test.ts"`
Expected: FAIL en las dos primeras y en la del kicker; la de las marcas ya pasa y debe seguir pasando.

- [ ] **Step 3: Sube la escala, quita las mayúsculas y elimina el kicker**

En `constants/theme.ts`: `body` y `bodyStrong` pasan a `fontSize: 16, lineHeight: 23`. `label` pasa a `fontSize: 13, lineHeight: 17, letterSpacing: 0.3` y pierde `textTransform`. `caption` y `captionStrong` pasan a `lineHeight: 17` con `letterSpacing: 0.1`. `eyebrow` se elimina del token; sus cinco usos pasan a `Typography.label`.

El cuerpo a 16px es el piso de lectura en móvil, y sobre una superficie oscura el texto pequeño necesita un poco más de interlineado y de tracking para no cerrarse.

En `_layout.tsx`, `tabBarLabelStyle` pierde `textTransform: 'uppercase'` y pasa a `fontSize: 12, letterSpacing: 0.3`. En `NowPlayingInfo.tsx`, `preachingBadgeText` pierde `textTransform` y su `letterSpacing: 0.9` baja a `0.2`. En `request.tsx`, `preachingBadge` pierde `textTransform` y su `letterSpacing: 0.8` baja a `0.2`; su `fontSize: 10` y su `lineHeight: 14` se borran, porque el rol ya trae los suyos.

En `ScreenHeader.tsx` desaparece el prop `eyebrow` y su estilo, y el componente queda con título y subtítulo. En las cuatro pantallas que lo pasaban, el `eyebrow=` se borra: "Pide tu música", "Estamos contigo", "Horarios y Emisiones" y "Nuestra comunidad" eran redundantes con un subtítulo que ya estaba debajo.

Los cuatro sitios de mayúsculas deliberadas no se tocan: `LiveBadge.tsx` (literal `EN VIVO`), `feedback.tsx:590,702` (cabecera mono y sello `AL AIRE`), `BiblePanel.tsx:307,381` (folio de la lectura).

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/type-casing.test.ts"`
Expected: PASS, 5 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm test"`
Expected: PASS, 3 archivos, 15 pruebas.

- [ ] **Step 5: Verifica tipos y revisa las cabeceras**

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

Abre En vivo, Horarios, Solicitar, Oración y Redes. Las cuatro cabeceras se leen en minúscula de oración, las etiquetas de la barra inferior también, y ningún texto se corta con el cuerpo a 16px. En Redes, el rótulo "Documentos legales" pasa a llamarse `legalSectionLabel` para no chocar con el `legalLabel` que ya existía para el título de cada documento.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "style(mobile): read labels in sentence case instead of uppercase"
```
