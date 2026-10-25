# Mobile Design Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las brechas de la revisión de diseño UX/UI de la app móvil La Voz de la Verdad: mini reproductor persistente, icono de oración, nombre unificado de pestaña Estación, Biblia con panel de lectura y barra inferior fija, horarios con tarjeta "al aire ahora" y chips, oración con nombre opcional y confirmación a pantalla completa, y redes con tono de iconos unificado y mosaico de dos columnas.

**Architecture:** Cada tarea es un componente o pantalla de React Native/Expo que consume los tokens de `constants/theme.ts`, los entornos de movimiento de `constants/motion.ts` y la háptica de `lib/haptics.ts`. Las pantallas viven en `app/(tabs)/`, los componentes compartidos en `components/` y los tests de diseño en `apps/mobile/tests/design/`. No hay cambios de navegación ni de backend.

**Tech Stack:** React Native, Expo, expo-router (js-tabs), react-native-reanimated, @gorhom/bottom-sheet, React Native SVG, Ionicons, TypeScript, vitest (tests de diseño existentes).

**Spec:** Auditoría UX/UI de la app móvil (documento de revisión compartido por el usuario) + código actual de `apps/mobile`. La auditoría está resumida en la conversación previa; este plan opera sobre ella.

## Global Constraints

- Responder y escribir código en español; comentarios de código y docstrings en inglés (AGENTS.md).
- TypeScript-first; evitar `any`; usar tipos explícitos en interfaces públicas.
- Colores solo desde `Colors` de `constants/theme.ts`; ningún literal hexadecimal hardcodeado en pantallas nuevas (tests `palette.test.ts` y `prayer-thread.test.ts` lo vigilan).
- Objetivos táctiles mínimos 48 dp; ningún `minHeight: 44` ni `minWidth: 44` (tests `touch-targets.test.ts`).
- Sin `textTransform: uppercase` en tokens legibles; sin mayúsculas sostenidas en títulos de programas ni etiquetas (tests `type-casing.test.ts`).
- `allowFontScaling` nunca se desactiva (tests `font-scaling.test.ts`).
- Reducido movimiento respetado vía `useReducedMotion` y `ReducedMotionConfig` en `app/_layout.tsx` (tests `reduced-motion.test.ts`).
- Háptica solo vía `lib/haptics.ts` (`tick`, `click`, `success`, `error`; ningún `Haptics.` fuera de ese módulo).
- Superposición de depuración (`PerfOverlay`) solo en `__DEV__`; devolver `null` en producción.
- Tally rojo (`#E44456`) reservado exclusivamente para estado en vivo (tests `palette.test.ts`).
- Navegación de pestañas anclada abajo, no flotante; indicador activo con forma y color, no solo color.
- Vocabulario de movimiento: `enterList`, `enterSheet`, `enterBlock` de `constants/motion.ts` (tests `motion-vocabulary.test.ts`).
- Un solo componente `PressScale` para pulsaciones; no crear `PressableScale` nuevos.

## Review Focus

- Mini reproductor aparece al cambiar de pestaña con audio activo y desaparece al pausar; tocarlo navega a En vivo con transición compartida.
- Badge de respuestas de oración no leídas sube al recibir respuesta nueva y baja al abrir el detalle (señal índigo, no tally).
- Oración: envío sin nombre (anónimo) no bloquea; nombre opcional no muestra error de validación.
- Horarios: "Hoy" calculado con zona horaria de Bogotá; al abrir la pantalla, la lista se desplaza al programa al aire.
- Reducido movimiento: disco quieto, solo cambia intensidad del halo; entradas sin desplazamiento.
- Escalado de fuente al 130 % y 150 %: barra de pestañas y selectores de día no se rompen.
- Íconos de redes sociales en tono lavanda único sobre superficie neutra; no cuatro colores vivos.
- Sin flechas decorativas `→` ni puntos medios separando datos.

---

### Task 1: Mini reproductor persistente (pestaña En vivo -> otras pestañas)

**Files:**
- Create: `apps/mobile/components/player/MiniPlayer.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (renderizar MiniPlayer encima de Tabs cuando haya audio)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (exponer estado de reproducción si no lo está ya)
- Test: `apps/mobile/tests/design/mini-player.test.ts`

**Interfaces:**
- Consumes: `usePlaybackState` de `react-native-track-player` (estado Playing/Paused/Buffering), `useAudioPlayer` (toggle, title, artist, artwork).
- Produces: `MiniPlayer({ isPlaying, title, artist, artwork, onPress })` componente que renderiza carátula pequeña, título, artista y botón pausa; se oculta cuando no hay audio.

- [ ] **Step 1: Write the failing test**

```tsx
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('mini player', () => {
  it('existe el componente MiniPlayer', () => {
    expect(read('components/player/MiniPlayer.tsx')).toMatch(/MiniPlayer/);
  });
  it('renderiza carátula, título, artista y botón pausa', () => {
    const src = read('components/player/MiniPlayer.tsx');
    expect(src).toMatch(/<Image/);
    expect(src).toMatch(/title/);
    expect(src).toMatch(/artist/);
    expect(src).toMatch(/pause/);
  });
  it('se renderiza en _layout encima de Tabs', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/MiniPlayer/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @radio/mobile test --run apps/mobile/tests/design/mini-player.test.ts`
Expected: FAIL (archivo o símbolo no encontrado)

- [ ] **Step 3: Implement `MiniPlayer` en `components/player/MiniPlayer.tsx`**

Componente ligero: fila horizontal con carátula de 32 dp, título truncado a 1 línea, artista en texto secundario, botón pausa/play de 40 dp. Colores desde `Colors`. Respeta `useReducedMotion` para entradas.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @radio/mobile test --run apps/mobile/tests/design/mini-player.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/player/MiniPlayer.tsx apps/mobile/tests/design/mini-player.test.ts
git commit -m "feat(mobile): add mini persistent player component"
```

---

### Task 2: Renderizar mini reproductor en las pestañas no-En vivo

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: estado de Track Player desde el contexto/global que ya usa `index.tsx`; se puede promover a un hook compartido `usePlayerVisible` o leer desde `useAudioPlayer`.
- Produces: `_layout.tsx` renderiza `<MiniPlayer />` condicionalmente entre el contenido de pestañas y la barra de tab, con fondo scrim y transición de entrada.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/_layout.tsx');
expect(src).toMatch(/MiniPlayer/);
expect(src).toMatch(/isPlaying/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

En `_layout.tsx`, importar `MiniPlayer` y renderizarlo cuando `isPlaying` sea true, por encima de `<Tabs />` y por debajo del contenido, con `position: absolute` arriba de la barra de tab o como banda fija inferior. Tocar navega a `(tabs)/index` (En vivo).

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/_layout.tsx
git commit -m "feat(mobile): render mini player on tab bar when audio active"
```

---

### Task 3: Icono de Oración (reemplazar body-outline)

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (pestaña Oración)

**Interfaces:**
- Consumes: `Ionicons` icon name string.
- Produces: pestaña Oración con icono de manos en oración (`pray` si existe en Ionicons, caso contrario `hands-clapped` o `heart`), sin cambiar el badge de respuestas no leídas.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/_layout.tsx');
expect(src).not.toMatch(/name="body-outline"/);
expect(src).toMatch(/Oración/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Cambiar `<Ionicons name="body-outline" ... />` por el icono de oración elegido. Mantener `UnreadAnswersBadge` y `tabBarAccessibilityLabel`.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/_layout.tsx
git commit -m "feat(mobile): change prayer tab icon to prayer hands"
```

---

### Task 4: Unificar nombre pestaña "Redes" / pantalla "La estación"

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (title de pestaña social)
- Modify: `apps/mobile/app/(tabs)/social.tsx` (ScreenHeader title)
- Test: `apps/mobile/tests/design/social-name.test.ts`

**Interfaces:**
- Decisión del usuario: "Estación" o "Más". Este plan asume "Estación" (pantalla sobre la emisora); si el usuario prefiere "Más", se cambia el literal.

- [ ] **Step 1: Write the failing test**

```tsx
const layout = read('app/(tabs)/_layout.tsx');
const social = read('app/(tabs)/social.tsx');
expect(layout).toMatch(/title: 'Estación'/);
expect(social).toMatch(/title="Estación"/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Cambiar `title: 'Redes'` a `title: 'Estación'` en `_layout.tsx` y `title="La estación"` a `title="Estación"` en `social.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/_layout.tsx apps/mobile/app/(tabs)/social.tsx
git commit -m "feat(mobile): unify redes/estacion tab name"
```

---

### Task 5: Biblia - botón "Aa" panel de lectura (reemplazar A-/A+)

**Files:**
- Modify: `apps/mobile/components/bible/BiblePanel.tsx`
- Create: `apps/mobile/components/bible/ReadingSettingsPanel.tsx` (opcional, si el panel es complejo)
- Test: `apps/mobile/tests/design/bible-reading-settings.test.ts`

**Interfaces:**
- Consumes: `fontSize`, `setFontSize`, `currentTranslation`, temas de lectura.
- Produces: un botón "Aa" que abre un panel/hoja con slider de tamaño, toggle serif/sans, interlineado y tres temas (noche, sepia, alto contraste). Se eliminan los botones separados "A-" y "A+".

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('components/bible/BiblePanel.tsx');
expect(src).toMatch(/Aa/);
expect(src).not.toMatch(/name="remove"|A-/);
expect(src).not.toMatch(/name="add"|A\+/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Reemplazar los dos botones `fontSizeBtn` por un solo botón "Aa" que abra un panel de ajustes de lectura. El panel puede ser un `AppBottomSheet` o un estado interno. Mantener mínimos 48 dp de objetivo táctil.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/bible/BiblePanel.tsx
git commit -m "feat(mobile): bible Aa reading settings panel"
```

---

### Task 6: Biblia - barra inferior fija (reemplazar píldora flotante)

**Files:**
- Modify: `apps/mobile/components/bible/BiblePanel.tsx`

**Interfaces:**
- Consumes: `currentBook`, `currentChapter`, `currentTranslation`, acciones `prevChapter`/`nextChapter`.
- Produces: barra inferior fija (no flotante sobre el texto) con fondo translúcido, línea de separación superior, flecha anterior, nombre del capítulo, chip de versión tocable, flecha siguiente. Altura similar a la barra de pestañas.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('components/bible/BiblePanel.tsx');
expect(src).toMatch(/bottomNav|barra inferior/);
expect(src).not.toMatch(/floatingNavContainer/);
expect(src).toMatch(/version/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Sustituir el `BlurView` con `floatingNavContainer` por una barra fija en `bottom: 0` (o dentro del content con `position: absolute` abajo pero sin superponerse al texto mediante `paddingBottom` del área de lectura). Incluir chip de versión.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/bible/BiblePanel.tsx
git commit -m "feat(mobile): bible fixed bottom navigation bar"
```

---

### Task 7: Biblia - resaltar y compartir versículo

**Files:**
- Modify: `apps/mobile/components/bible/BiblePanel.tsx`
- Test: `apps/mobile/tests/design/bible-highlight-share.test.ts`

**Interfaces:**
- Consumes: `verse`, `currentBook`, `currentChapter`, `currentTranslation`.
- Produces: al mantener pulsado un versículo (o un botón de acciones por verso), opciones: resaltar en color (ámbar suave, lavanda, verde), copiar, compartir como imagen (serif, fondo noche, referencia).

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('components/bible/BiblePanel.tsx');
expect(src).toMatch(/highlight|resaltar/);
expect(src).toMatch(/Share\.share|compartir/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Agregar `onLongPress` o un menú de acciones por verso con estados de resaltado (guardar en MMKV o estado local) y uso de `Share.share` o `expo-sharing` para imagen del versículo.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/bible/BiblePanel.tsx
git commit -m "feat(mobile): bible highlight and share verse"
```

---

### Task 8: Horarios - tarjeta "Al aire ahora"

**Files:**
- Modify: `apps/mobile/app/(tabs)/schedule.tsx`
- Test: `apps/mobile/tests/design/schedule-on-air.test.ts`

**Interfaces:**
- Consumes: `schedule`, `selectedDay`, `is_now` / `type === 'streamer'` de cada programa.
- Produces: tarjeta destacada al inicio de la lista con fondo `inkElevated`, etiqueta "Al aire ahora", ecualizador simulado discreto, rango horario. Al abrir la pantalla, scroll automático al programa actual.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/schedule.tsx');
expect(src).toMatch(/Al aire ahora/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Agregar `OnAirCard` renderizada antes de las secciones cuando exista `program.is_now`. Usar `ScrollView.scrollToOffset` o `useRef` con `scrollTo` al montar si hay programa al aire.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/schedule.tsx
git commit -m "feat(mobile): schedule on-air-now card"
```

---

### Task 9: Horarios - chips de categoría (reemplazar desplegable)

**Files:**
- Modify: `apps/mobile/app/(tabs)/schedule.tsx`
- Modify: `apps/mobile/components/player/CategoryFilterButton.tsx` o crear `CategoryChips.tsx`
- Test: `apps/mobile/tests/design/schedule-category-chips.test.ts`

**Interfaces:**
- Consumes: `categories`, `selectedCategoryId`, `onSelectCategory`.
- Produces: fila horizontal desplazable de chips ("Todos", "Prédicas", "Noticias", etc.) con punto de color de categoría; tocar filtra. Se elimina o se oculta el botón desplegable que abre hoja.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/schedule.tsx');
expect(src).toMatch(/chips|CategoryChip/);
expect(src).not.toMatch(/CategoryPickerModal/); // o se oculta
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Crear `CategoryChips` con `ScrollView horizontal` y chips de 48 dp mínimo. Conectar `selectedCategoryId`.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/schedule.tsx
git commit -m "feat(mobile): schedule category chips"
```

---

### Task 10: Horarios - campana por programa (recordatorio)

**Files:**
- Modify: `apps/mobile/app/(tabs)/schedule.tsx` (ProgramRow y TimelineRow)
- Modify: `apps/mobile/hooks/useProgramNotify.tsx` (si existe) o crear hook de suscripción por programa
- Test: `apps/mobile/tests/design/schedule-program-bell.test.ts`

**Interfaces:**
- Consumes: `program.id`, estado de suscripción del programa.
- Produces: icono de campana en cada fila de programa; se rellena al activarse; háptica ligera; aviso breve "Te avisaremos antes de <programa>".

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/schedule.tsx');
expect(src).toMatch(/campana|notifications|bell/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Agregar `Pressable` con icono de campana en `ProgramRow` y `TimelineRow`, conectado a `useProgramNotify` o similar. Mostrar estado activado/desactivado.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/schedule.tsx
git commit -m "feat(mobile): schedule program reminder bell"
```

---

### Task 11: Oración - nombre opcional / envío anónimo

**Files:**
- Modify: `apps/mobile/app/(tabs)/prayer.tsx`
- Test: `apps/mobile/tests/design/prayer-anonymous.test.ts`

**Interfaces:**
- Consumes: `name`, `request`, `acceptsDataTreatment`.
- Produces: el campo Nombre indica que es opcional; la validación no bloquea si `name` está vacío; el consentimiento sigue siendo obligatorio.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/prayer.tsx');
expect(src).toMatch(/opcional|opcionalmente|anónimo|anonymous/);
expect(src).not.toMatch(/!trimmedName.*errors\.name/); // validación relajada
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Eliminar `errors.name` del bloqueo de `handleSubmit`; cambiar label y placeholder para indicar opcional; mantener validación de `request` y `consent`.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/prayer.tsx
git commit -m "feat(mobile): prayer optional name anonymous send"
```

---

### Task 12: Oración - confirmación a pantalla completa

**Files:**
- Modify: `apps/mobile/app/(tabs)/prayer.tsx`
- Test: `apps/mobile/tests/design/prayer-confirmation.test.ts`

**Interfaces:**
- Consumes: estado `sent`.
- Produces: cuando `sent` es true, renderizar una vista de confirmación a pantalla completa (no tarjeta inline dentro del scroll) con animación de éxito, texto cálido ("Tu petición fue recibida. Estaremos orando por ti"), vibración de éxito y botones para enviar otra o volver a En vivo.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/prayer.tsx');
expect(src).toMatch(/Tu petición fue recibida|estamos orando/);
expect(src).toMatch(/success\(\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Reemplazar el `successCard` inline por una pantalla de confirmación que ocupe todo el alto, con `ZoomIn`/`FadeInDown`, ícono de éxito grande y botones de acción.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/prayer.tsx
git commit -m "feat(mobile): prayer full-screen confirmation"
```

---

### Task 13: Oración - versículo del día como héroe

**Files:**
- Modify: `apps/mobile/app/(tabs)/prayer.tsx`
- Test: `apps/mobile/tests/design/prayer-verse-hero.test.ts`

**Interfaces:**
- Consumes: `verse` de `useDailyVerse()`.
- Produces: tarjeta amplia con fondo `inkElevated`, halo violeta suave (`signalGlow`), texto en serif (`Typography.message` o `Fraunces`) a 24-26 dp, referencia en lavanda o ámbar debajo, acciones de compartir y abrir en Biblia.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/prayer.tsx');
expect(src).toMatch(/verseText|Fraunces|serif/);
expect(src).toMatch(/Compartir|Abrir en Biblia/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Envolver el versículo en una tarjeta destacada (`surfaceElevated` o `inkElevated`) con `borderRadius` grande, usar familia serif para el texto del versículo, agregar referencia y dos botones de acción discretos.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/prayer.tsx
git commit -m "feat(mobile): prayer verse of the day hero card"
```

---

### Task 14: Redes - "Escríbenos" en tuteo

**Files:**
- Modify: `apps/mobile/app/(tabs)/social.tsx`
- Test: `apps/mobile/tests/design/social-tuteo.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `writeTitle` cambia de "Escríbanos" a "Escríbenos"; `accessibilityLabel` igual.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/social.tsx');
expect(src).toMatch(/Escríbenos/);
expect(src).not.toMatch(/Escríbanos/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Cambiar literal.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/social.tsx
git commit -m "feat(mobile): social escribenos tuteo"
```

---

### Task 15: Redes - iconos de redes en tono lavanda único

**Files:**
- Modify: `apps/mobile/app/(tabs)/social.tsx`
- Test: `apps/mobile/tests/design/social-icon-tone.test.ts`

**Interfaces:**
- Consumes: `Colors.signal` o `Colors.lavanda` (si no existe, usar `Colors.signalLight` #A7A2F6).
- Produces: iconos de Facebook, Instagram, YouTube, Spotify en tono lavanda uniforme sobre recuadro neutro, no en sus colores oficiales vivos.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/social.tsx');
expect(src).not.toMatch(/#1877f2/);
expect(src).not.toMatch(/#e1306c/);
expect(src).not.toMatch(/#ff0000/);
expect(src).not.toMatch(/#1DB954/);
expect(src).toMatch(/Colors\.signal|Colors\.signalLight|lavanda/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Reemplazar `color: link.color` por `Colors.signalLight` (lavanda) en los `Ionicons`/`FontAwesome` de redes y ajustar `backgroundColor` del círculo a un tono neutro muted.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/social.tsx
git commit -m "feat(mobile): social icons single lavanda tone"
```

---

### Task 16: Redes - mosaico de dos columnas para redes sociales

**Files:**
- Modify: `apps/mobile/app/(tabs)/social.tsx`
- Test: `apps/mobile/tests/design/social-two-column.test.ts`

**Interfaces:**
- Consumes: `socialLinks` array.
- Produces: las cuatro filas de redes se renderizan en una cuadrícula de dos columnas con mosaicos compactos (icono, nombre, línea corta), reduciendo la longitud vertical de la pantalla.

- [ ] **Step 1: Write the failing test**

```tsx
const src = read('app/(tabs)/social.tsx');
expect(src).toMatch(/grid|flexDirection: 'row'.*flexWrap/);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

Reemplazar el `.map` vertical por un contenedor con `flexDirection: 'row'`, `flexWrap: 'wrap'`, y cada link con `width: '50%'` (dos columnas) o un componente `SocialGrid`.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/social.tsx
git commit -m "feat(mobile): social two-column grid"
```

---

### Task 17: Tests de diseño adicionales (blindaje de las nuevas pantallas)

**Files:**
- Create: `apps/mobile/tests/design/mini-player.test.ts`
- Create: `apps/mobile/tests/design/social-name.test.ts`
- Create: `apps/mobile/tests/design/bible-reading-settings.test.ts`
- Create: `apps/mobile/tests/design/bible-highlight-share.test.ts`
- Create: `apps/mobile/tests/design/schedule-on-air.test.ts`
- Create: `apps/mobile/tests/design/schedule-category-chips.test.ts`
- Create: `apps/mobile/tests/design/schedule-program-bell.test.ts`
- Create: `apps/mobile/tests/design/prayer-anonymous.test.ts`
- Create: `apps/mobile/tests/design/prayer-confirmation.test.ts`
- Create: `apps/mobile/tests/design/prayer-verse-hero.test.ts`
- Create: `apps/mobile/tests/design/social-tuteo.test.ts`
- Create: `apps/mobile/tests/design/social-icon-tone.test.ts`
- Create: `apps/mobile/tests/design/social-two-column.test.ts`
- Create: `apps/mobile/tests/design/social-name.test.ts`

**Interfaces:**
- Cada test lee archivos fuente con `readFileSync` y aserva patrones exactos (estilo de los 15 tests existentes en `tests/design/`).

- [ ] **Step 1: Write all failing tests**

Crear los 13 archivos de test con aserciones que fallen inicialmente (archivos objetivo no existen o no contienen los patrones).

- [ ] **Step 2: Run all tests to verify they fail**

Run: `pnpm --filter @radio/mobile test --run apps/mobile/tests/design/`
Expected: varios FAIL

- [ ] **Step 3: Implement todas las tareas 1-16** (ya descritas arriba)

- [ ] **Step 4: Run all tests to verify they pass**

Run: `pnpm --filter @radio/mobile test --run apps/mobile/tests/design/`
Expected: PASS (incluyendo los 15 tests preexistentes)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/tests/design/
git commit -m "test(mobile): design tests for review gaps"
```

---

### Task 18: Ejecutar suite completa de tests y lint

**Files:**
- Ninguno nuevo.

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @radio/mobile test --run`
Expected: todos los tests pasan (diseño + existentes)

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm --filter @radio/mobile tsc --noEmit` (o el script de typecheck del proyecto)
Expected: sin errores de tipo

- [ ] **Step 3: Run ESLint**

Run: `pnpm --filter @radio/mobile lint`
Expected: sin errores de lint

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore(mobile): verify tests, types, and lint after design review"
```

---

## Notas de ejecución

- Las tareas 1-16 son en gran parte independientes entre sí (tocan archivos distintos). Pueden implementarse en cualquier orden, aunque se sugiere comenzar por la Task 1 (mini reproductor) y Task 3 (icono de oración) por ser de mayor percepción de calidad con menor esfuerzo, como señala la auditoría.
- Cada tarea incluye su propio test de diseño antes del código (TDD ligero), acorde al patrón existente en `apps/mobile/tests/design/`.
- No se añaden nuevas dependencias: todo se resuelve con librerías ya instaladas (`react-native-reanimated`, `@gorhom/bottom-sheet`, `expo-linear-gradient`, `expo-sharing` si está disponible, `react-native-svg`, Ionicons).
- Si el usuario prefiere "Más" en lugar de "Estación" para la pestaña redes, solo cambiar el literal en Task 4.
- Al finalizar, se recomienda un review completo de la rama antes de mergear.

Plan completo y listo para revisión. ¿Captura lo que quieres y qué enfoque de ejecución prefieres: subagent-driven o nativo?