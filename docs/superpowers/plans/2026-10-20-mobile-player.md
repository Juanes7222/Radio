# El reproductor de la app móvil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el reproductor diga qué está sonando, no solo que hay algo sonando: el disco se detiene cuando lo que suena es la voz, la barra superior queda en dos elementos con una sola hoja de opciones, el temporizador vive en un solo lugar, "A continuación" muestra su carátula y el Bible deja de ser un botón suelto.

**Architecture:** Todo el trabajo cae en la pantalla del reproductor (`app/(tabs)/index.tsx`) y en sus componentes. La pieza central es `DialVivo`, que ya distingue una prédica de una canción (`isPreaching`): se le cambia la semántica, no su forma. La barra superior se vacía y sus cuatro hojas se convierten en secciones de una sola hoja nueva; el editor de alarmas sigue siendo su propia hoja porque configurar una alarma es una tarea, no un ajuste.

**Tech Stack:** React Native 0.86 + Expo 57, Reanimated 4.5, `expo-image`, `@gorhom/bottom-sheet`, Vitest 4 (entorno node), TypeScript estricto, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-20-mobile-design-system-design.md`, sección 5.

Consume los tokens de `2026-10-20-mobile-visual-system.md` (`Colors.signalFill`, `Colors.scrim`, `Colors.inkElevated`, `Colors.borderGlass`). No depende de los planes de Solicitar/Oración ni de accesibilidad y movimiento.

## Global Constraints

- Sin dependencias nuevas de runtime ni de desarrollo.
- Ningún color literal en componentes.
- Los comentarios, JSDoc y descripciones de funciones se escriben en inglés (AGENTS.md). El copy que ve el oyente va en español y en mayúscula de oración.
- Área táctil mínima de 48dp en todo control nuevo o redimensionado (ver el plan de accesibilidad).
- Las animaciones nuevas respetan `reduceMotion`: si el sistema pide menos movimiento, la animación no se ejecuta.
- Las pruebas son Vitest con `environment: "node"` y `include: ["tests/**/*.test.ts"]`, así que no hay runtime de React Native: el cableado entre componentes se prueba como prueba de fuente con `readFileSync`, y la lógica pura se prueba importando el módulo.
- En esta máquina PowerShell bloquea `pnpm.ps1`. Todos los comandos se ejecutan como `cmd /c "cd apps\mobile && pnpm ..."`.
- Línea base verificada antes de empezar: `pnpm test` da 1 archivo y 4 pruebas en verde, y `pnpm exec tsc --noEmit` no imprime nada.

## Review Focus

1. **La cola sigue sonando cuando el reproductor no está montado.** El temporizador expira aunque el oyente esté en otra pestaña: si la cuenta atrás vive en un componente que se desmonta, la música no se corta. Prueba de Task 3.
2. **La estación expone un solo mount.** Es el caso normal: el control de calidad no puede quedar huérfano ni dejar una fila vacía en la hoja. Prueba de Task 2.
3. **La hoja de opciones tiene cuatro secciones y una sola hoja.** Si las secciones viejas siguen montadas aparte, hay dos superficies para lo mismo. Prueba de Task 2.
4. **La lectura del día no existe o la petición falla.** `GET /api/bible/reading/today` devuelve `{ reading: null }` en una emisora sin rotación activa, que es el caso frecuente: la tarjeta debe desaparecer y la Biblia seguir siendo alcanzable. Prueba de Task 5.
5. **Una lectura de varios libros en una pantalla de 320dp.** La etiqueta puede ser "Salmos 23–24 · Juan 3"; no puede partirse en tres líneas ni empujar los controles. Prueba de Task 5.

---

### Task 1: El anillo de voz

El vinilo girando dice "música" cuando lo que suena es una prédica, y el anillo de progreso dice "62 % de una canción que no puedes buscar", que no significa nada en una emisión en vivo. `DialVivo` ya sabe distinguir las dos cosas: baja el halo de 0.42 a 0.18 cuando `isPreaching` es cierto. Lo que falta es que el resto del dial obedezca.

**Files:**
- Modify: `apps/mobile/components/player/DialVivo.tsx` (efecto de rotación, efecto del anillo, centro del disco)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (el `progress` que se pasa al dial)
- Test: `apps/mobile/tests/design/dial-voice.test.ts`

**Interfaces:**
- Consumes: `Colors.signal`, `Colors.textFaint` (existentes).
- Produces: nada que otra tarea use. El contrato de `DialVivoProps` no cambia: sigue recibiendo `artworkUri`, `isPlaying`, `isPreaching`, `size`, `progress` y `songId`.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/dial-voice.test.ts`. Es una prueba de fuente porque el efecto vive en un componente y la suite no tiene runtime de React Native:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dialPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..',
  'components', 'player', 'DialVivo.tsx',
);

describe('DialVivo voice state', () => {
  it('stops the disc when a preaching is on air, on start and on resume', () => {
    const source = readFileSync(dialPath, 'utf8');
    const spinGates = source.match(/isPlaying && !isPreaching && !reduceMotion\.value/g) ?? [];

    expect(spinGates).toHaveLength(2);
  });

  it('empties the progress ring while the voice is on air', () => {
    const source = readFileSync(dialPath, 'utf8');

    expect(source).toMatch(/isPreaching \? 0 :/);
    expect(source).toMatch(/\}, \[progress, songId, isPreaching, ringProgress\]\);/);
  });

  it('shows a voice mark instead of a cover when there is no artwork', () => {
    const source = readFileSync(dialPath, 'utf8');

    expect(source).toMatch(/name="mic"/);
  });
});
```

La guarda del halo (`if (isPlaying && !reduceMotion.value) {`) **no** lleva `!isPreaching` y la prueba no la mira: ese efecto es el que mantiene vivo el relleno, y ahí el movimiento es la señal de que la emisión sigue. Solo las dos guardas de rotación cuentan.

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/dial-voice.test.ts"`
Expected: FAIL. Ninguna guarda contiene `!isPreaching`, el anillo no mira `isPreaching` y no hay ningún icono de micrófono.

- [ ] **Step 3: Aplica la guarda de voz**

En `DialVivo.tsx`:

- El efecto de rotación: la condición pasa a `if (isPlaying && !isPreaching && !reduceMotion.value)` y su arreglo de dependencias queda exactamente `}, [isPlaying, isPreaching, rotation, reduceMotion]);`. En el listener de `AppState`, la rama de reactivación usa `else if (isPlaying && !isPreaching && !reduceMotion.value)`, y su arreglo queda exactamente `}, [isPlaying, isPreaching, rotation, haloScale, haloOpacity, reduceMotion]);`. El `else` que llama `cancelAnimation(rotation)` ya existe y no cambia: es lo que detiene el giro a mitad de vuelta sin salto.
- El efecto del anillo: el valor clamped pasa a `isPreaching ? 0 : (progress == null ? 0 : Math.min(1, Math.max(0, progress)))`, de modo que el arco se drena con su easing habitual en vez de desaparecer de golpe, y el arreglo de dependencias queda exactamente `}, [progress, songId, isPreaching, ringProgress]);`.
- El centro del disco: hoy muestra la carátula y, cuando no hay, `DefaultAlbumArt`. Pasa a mostrar un `Ionicons name="mic"` de `Colors.signal` con el tamaño de la etiqueta cuando `isPreaching` es cierto **y** no hay `artworkUri`. Cuando hay carátula, se conserva: la imagen de un sermón es la del programa, que es exactamente lo que el oyente debe ver. El archivo tiene que importar `Ionicons` de `@expo/vector-icons`.

No toques las dos guardas del halo ni sus opacidades (`0.42` en música, `0.18` en voz): el halo sigue siendo el anillo orgánico que respira alrededor del disco.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/dial-voice.test.ts"`
Expected: PASS, 3 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Revisa los dos estados en dispositivo**

Con música sonando, el disco gira, el arco crece y el centro muestra la carátula. Con una prédica, el disco se detiene en el sitio donde estaba, el arco se drena y queda el anillo de fondo con el halo respirando, y el centro muestra la imagen del programa o el micrófono si no hay ninguna. La transición entre ambos estados no debe dar un salto: el disco frena, no se teletransporta.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/player/DialVivo.tsx apps/mobile/app/"(tabs)"/index.tsx apps/mobile/tests/design/dial-voice.test.ts
git commit -m "feat(mobile): hold the disc still and empty the ring while a preaching is on air"
```

---

### Task 2: La barra superior queda en dos elementos y las hojas en una

La barra tiene hoy cinco elementos, y por eso esconde el contador de oyentes por debajo de 430dp: la propia barra calcula ese umbral. Y las hojas son cuatro. La barra queda en **EN VIVO** y **un botón de opciones**, que abre **una sola hoja** con notificaciones, temporizador, calidad y una fila que abre el editor de alarmas.

**Files:**
- Create: `apps/mobile/components/options/NotificationsOptions.tsx`
- Create: `apps/mobile/components/options/SleepTimerOptions.tsx`
- Create: `apps/mobile/components/options/QualityOptions.tsx`
- Create: `apps/mobile/components/player/ListeningOptionsSheet.tsx`
- Modify: `apps/mobile/components/player/PlayerTopBar.tsx` (props y contenido)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (montar la hoja nueva, quitar las tres hojas y sus estados)
- Delete: `apps/mobile/components/NotificationsModal.tsx`, `apps/mobile/components/SleepTimerModal.tsx`, `apps/mobile/components/QualityModal.tsx`
- Test: `apps/mobile/tests/design/listening-options.test.ts`

**Interfaces:**
- Consumes: `Colors.signalFill`, `Colors.inkElevated`, `Colors.borderGlass`, `Colors.scrim` (del plan del sistema visual).
- Produces:
  - `ListeningOptionsSheetProps`: `{ visible: boolean; onClose: () => void; notifyEnabled: boolean; onToggleCurrent: () => void; currentSongTitle?: string; exactAlarmGranted?: boolean | null; timerEndTime: number | null; onSelectPreset: (minutes: number) => void; onCancelTimer: () => void; quality: StreamQuality | null; availableQualities: StreamQuality[]; onSelectQuality: (q: StreamQuality) => void; onOpenAlarms: () => void }`.
  - `PlayerTopBarProps` queda en `{ listenersCount: number; onOpenOptions: () => void }`.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/listening-options.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('listening options', () => {
  it('keeps two elements in the top bar', () => {
    const bar = read('components/player/PlayerTopBar.tsx');

    expect(bar).toMatch(/onOpenOptions: \(\) => void/);
    expect(bar).not.toMatch(/onOpenNotifications|onOpenSleepTimer|onOpenAlarm|onOpenQuality/);
    expect(bar).not.toMatch(/timerBadge|qualityBadge/);
  });

  it('hosts every listening setting in one sheet', () => {
    const sheet = read('components/player/ListeningOptionsSheet.tsx');

    expect(sheet).toMatch(/NotificationsOptions/);
    expect(sheet).toMatch(/SleepTimerOptions/);
    expect(sheet).toMatch(/QualityOptions/);
    expect(sheet).toMatch(/onOpenAlarms/);
  });

  it('hides the quality section when there is a single mount', () => {
    const sheet = read('components/player/ListeningOptionsSheet.tsx');

    expect(sheet).toMatch(/availableQualities\.length > 1/);
  });

  it('removes the three sheets it replaces', () => {
    for (const file of [
      'components/NotificationsModal.tsx',
      'components/SleepTimerModal.tsx',
      'components/QualityModal.tsx',
    ]) {
      expect(existsSync(join(appRoot, file))).toBe(false);
    }
  });

  it('mounts the new sheet and no longer mounts the old ones', () => {
    const screen = read('app/(tabs)/index.tsx');

    expect(screen).toMatch(/<ListeningOptionsSheet/);
    expect(screen).not.toMatch(/NotificationsModal|SleepTimerModal|QualityModal/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/listening-options.test.ts"`
Expected: FAIL en las cinco. Los tres archivos viejos existen, la hoja nueva no existe y la barra sigue con sus cuatro callbacks.

- [ ] **Step 3: Extrae las secciones**

Cada modal viejo se convierte en un componente de contenido sin hoja: se copia su cuerpo (la parte entre el `AppBottomSheet` y su cierre) a un componente nuevo que recibe las mismas props menos `visible` y `onClose`, y devuelve `View` en vez de `AppBottomSheet`.

- `components/options/NotificationsOptions.tsx`: props `{ notifyEnabled, onToggleCurrent, currentSongTitle?, exactAlarmGranted? }`. Mantiene el uso de `useProgramSubscriptions` y el aviso de "alarmas exactas" de Android. El título "Notificaciones" pasa a ser un encabezado de sección, no el título de la hoja.
- `components/options/SleepTimerOptions.tsx`: props `{ isActive, endTime, onSelectPreset, onCancel }`. Los cuatro presets (`SLEEP_PRESETS`) se muestran como filas con su nombre actual ("Siesta", "Prédica", "Noche", "Descanso"), que el documento pide mantener, y si el temporizador está activo, una línea con la hora de fin: "Termina a las 23:30". La línea se calcula con `new Date(endTime).toLocaleTimeString()`, sin cuenta atrás: la cuenta atrás vive en la burbuja (Task 3). El texto del preset de 30 minutos pasa de "Predica" a "Prédica": es el mismo nombre, con la tilde que le falta.
- `components/options/QualityOptions.tsx`: props `{ currentQuality, availableQualities, onSelect }`. El copy deja de hablar en bits por segundo: "Baja (ahorra datos)", "Media", "Alta" con el valor entre paréntesis. Es el mismo dato, con la palabra del oyente delante; el critique del 4 de octubre señaló que pedir 64/128/320 kbps es lenguaje de ingeniero.

- [ ] **Step 4: Monta la hoja única**

Crea `components/player/ListeningOptionsSheet.tsx`: un `AppBottomSheet` con `snapPoints={['78%', '92%']}`, un encabezado "Opciones de escucha" y un `BottomSheetScrollView` con las secciones en este orden: Notificaciones, Temporizador, Calidad (solo si `availableQualities.length > 1`), Alarmas. La sección de alarmas es una fila con el icono de alarma, el texto "Alarmas de radio" y un chevron; al pulsarla llama `onOpenAlarms()` y cierra la hoja. El editor de alarmas (`AlarmModal`) se conserva como hoja propia y `index.tsx` lo sigue montando.

Cada sección va envuelta en un `View` con `gap: Spacing.md` y un encabezado con `Typography.sectionTitle` y `Colors.textMuted`. La hoja comparte el color de la app: `AppBottomSheet` ya lee `Colors.inkElevated`.

- [ ] **Step 5: Vacía la barra superior**

En `PlayerTopBar.tsx`: la interfaz queda en `{ listenersCount: number; onOpenOptions: () => void }`. La vista pasa a `justifyContent: 'space-between'` con el `LiveBadge` a la izquierda y un único `TouchableOpacity` a la derecha con `Ionicons name="options-outline"`, `accessibilityLabel="Opciones de escucha"` y `accessibilityHint="Notificaciones, temporizador, calidad y alarmas"`. El botón usa el mismo `iconButton` de antes. Se elimina el tooltip de "Configúralo aquí cuando desees": apuntaba al botón de notificaciones, que ya no está en la barra; la sección de notificaciones de la hoja explica lo mismo.

En `(tabs)/index.tsx`: pasa `listenersCount` y `onOpenOptions={() => setShowOptions(true)}`; elimina los estados `showNotifyMenu`, `showSleepMenu`, `showQualityMenu` y sus tres montajes, y monta `<ListeningOptionsSheet>` con las props de la interfaz de arriba. `showAlarmMenu` y `AlarmModal` se quedan.

- [ ] **Step 6: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/listening-options.test.ts"`
Expected: PASS, 5 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm test"`
Expected: PASS, 4 archivos.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 7: Revisa la hoja en dispositivo**

Abre la hoja y comprueba las cuatro secciones. La de calidad no aparece con un solo mount. La de alarmas abre el editor y vuelve al reproductor. Con el temporizador activo, la línea "Termina a las 23:30" es correcta. La barra superior queda en dos elementos y el contador de oyentes aparece en teléfonos de 400dp.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/components apps/mobile/app/"(tabs)"/index.tsx apps/mobile/tests/design/listening-options.test.ts
git commit -m "refactor(mobile): collapse the top bar into two elements and one options sheet"
```

---

### Task 3: El temporizador vive en un solo lugar

Hoy el temporizador se ve en tres sitios: el icono de la barra, el badge con la cuenta atrás y la burbuja con el anillo. Y la cuenta atrás es un tick de 5 segundos, así que el `mm:ss` salta de cinco en cinco. La cuenta atrás vive en la burbuja, con su propio tick de un segundo y su propio estado, para que la pantalla del reproductor no se vuelva a renderizar cada segundo.

**Files:**
- Modify: `apps/mobile/hooks/useSleepTimer.ts` (el hook deja de contar; expone la hora de fin)
- Modify: `apps/mobile/components/player/SleepTimerBubble.tsx` (cuenta atrás local)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (props de la burbuja)
- Test: `apps/mobile/tests/design/sleep-timer.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `useSleepTimer(onExpire)` devuelve `{ endTime: number | null; totalSeconds: number | null; isActive: boolean; start: (minutes: number) => void; cancel: () => void }`. `SleepTimerBubble` recibe `{ endTime: number; totalSeconds: number | null; onCancel: () => void }` y calcula el resto por su cuenta.
- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/sleep-timer.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('sleep timer', () => {
  it('stops counting in the hook that owns the whole screen', () => {
    const hook = read('hooks/useSleepTimer.ts');

    expect(hook).not.toMatch(/setRemaining/);
    expect(hook).not.toMatch(/display:/);
  });

  it('counts down inside the bubble, once per second', () => {
    const bubble = read('components/player/SleepTimerBubble.tsx');

    expect(bubble).toMatch(/setInterval\([^,]+,\s*1000\)/);
    expect(bubble).toMatch(/endTime/);
  });

  it('gives the bubble the end time instead of a precomputed string', () => {
    const screen = read('app/(tabs)/index.tsx');

    expect(screen).toMatch(/<SleepTimerBubble[\s\S]{0,320}endTime=/);
    expect(screen).not.toMatch(/display=\{sleepTimer\.display\}/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/sleep-timer.test.ts"`
Expected: FAIL en las tres. El hook todavía cuenta con `setRemaining` y la burbuja recibe una cadena ya formateada.

- [ ] **Step 3: Mueve la cuenta atrás a la burbuja**

En `hooks/useSleepTimer.ts`: elimina el estado `remaining` y el `display` derivado, y también el `progress`, que pasa a calcularlo la burbuja. El `setInterval` de 5 segundos pasa a ser solo una comprobación de caducidad: cuando el reloj supera la hora de fin, llama `clear()` y `onExpire()`, y en cualquier otro caso no toca ningún estado. El intervalo puede seguir siendo de 5 segundos: la caducidad no necesita precisión de un segundo y así el hook no vuelve a renderizar la pantalla. El `AppState` listener, que ya recalcula al volver al primer plano, se queda. El resto de la interfaz del hook queda así: `endTime`, `totalSeconds`, `isActive`, `start` y `cancel`.

En `components/player/SleepTimerBubble.tsx`: la burbuja recibe `endTime` y `totalSeconds`, y calcula por su cuenta `remaining` con un `useState` propio y un `setInterval` de 1000 ms que hace `Math.ceil((endTime - Date.now()) / 1000)`. El texto sigue siendo `mm:ss`, y el arco del anillo se calcula con `remaining / totalSeconds`; si `totalSeconds` es `null` (temporizador restaurado de una versión antigua), el arco se omite como hoy. Al llegar a cero la burbuja se oculta sola.

En `(tabs)/index.tsx`: `<SleepTimerBubble endTime={sleepTimer.endTime} totalSeconds={sleepTimer.totalSeconds} onCancel={sleepTimer.cancel} />`. `sleepTimer.display` desaparece de la pantalla.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/sleep-timer.test.ts"`
Expected: PASS, 3 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Verifica la caducidad fuera del reproductor**

Arranca un temporizador de un minuto, sal a otra pestaña y espera. La música se tiene que cortar al cumplirse el plazo, aunque la burbuja no estuviera montada: ese es el motivo por el que la caducidad se queda en el hook y no en la burbuja. Vuelve al reproductor y comprueba que la cuenta atrás que muestra la burbuja es la correcta, aunque el reloj se haya movido.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/hooks/useSleepTimer.ts apps/mobile/components/player/SleepTimerBubble.tsx apps/mobile/app/"(tabs)"/index.tsx apps/mobile/tests/design/sleep-timer.test.ts
git commit -m "refactor(mobile): count the sleep timer down in the bubble instead of the screen"
```

---

### Task 4: "A continuación" con miniatura

`playing_next.song.art` ya viene en la respuesta de la API (`packages/types/src/azuracast.ts:106`), así que la miniatura no necesita ninguna llamada nueva: es un dato que la app ya recibe y no está usando.

**Files:**
- Modify: `apps/mobile/components/player/NextUpCard.tsx` (prop `art` y miniatura)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (pasar `art`)
- Test: `apps/mobile/tests/design/next-up-card.test.ts`

**Interfaces:**
- Consumes: `Colors.borderGlass`, `Colors.surfaceSoft` (existentes).
- Produces: `NextUpCard` acepta `art?: string | null`.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/next-up-card.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('NextUpCard', () => {
  it('shows the artwork of the next track', () => {
    const card = read('components/player/NextUpCard.tsx');

    expect(card).toMatch(/art\?: string \| null/);
    expect(card).toMatch(/<Image/);
  });

  it('receives the artwork from the payload', () => {
    const screen = read('app/(tabs)/index.tsx');

    expect(screen).toMatch(/playing_next\?\.song\.art/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/next-up-card.test.ts"`
Expected: FAIL en las dos.

- [ ] **Step 3: Añade la miniatura**

En `NextUpCard.tsx`: la interfaz pasa a `{ song: { title: string; artist: string }; art?: string | null; active?: boolean }`. Cuando hay `art`, la tarjeta pinta una `Image` de `expo-image` de 40×40 con `contentFit="cover"` y `borderRadius: Radii.sm` a la izquierda, antes del icono de "siguiente"; cuando no hay, no se pinta nada y el layout queda como hoy. El `memo` sigue, y el objeto `nextUpSong` de `index.tsx` pasa a llevar `art` en el `useMemo` para que el `memo` no se rompa con una carátula vieja.

En `(tabs)/index.tsx`: el `useMemo` de `nextUpSong` incluye `rawNextUp?.art`, y el componente recibe `art={nextUpSong.art}`.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/next-up-card.test.ts"`
Expected: PASS, 2 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/player/NextUpCard.tsx apps/mobile/app/"(tabs)"/index.tsx apps/mobile/tests/design/next-up-card.test.ts
git commit -m "feat(mobile): show the next track artwork on the coming-up card"
```

---

### Task 5: La lectura del día ocupa el lugar de la píldora de Biblia

La píldora flotante compite con el héroe y no dice nada. En su lugar, una tarjeta con los capítulos que la rotación bíblica emitió hoy, que es el dato real que el backend ya publica. Cuando no hay lectura, la píldora actual queda como respaldo y nada desaparece.

**Files:**
- Create: `apps/mobile/lib/formatReading.ts`
- Create: `apps/mobile/hooks/useTodayReading.ts`
- Create: `apps/mobile/components/player/ReadingOfTheDayCard.tsx`
- Modify: `apps/mobile/components/bible/BiblePanel.tsx` (prop `initialReading`)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (quitar la píldora de `topSection`, montar la tarjeta, pasar `initialReading`)
- Test: `apps/mobile/tests/design/format-reading.test.ts`

**Interfaces:**
- Consumes: `Colors.inkElevated`, `Colors.borderGlass`, `Colors.signal`; `BACKEND_URL` de `constants/api`; `BibleReadingToday` y `BibleChapterRef` de `@radio/types`.
- Produces:
  - `lib/formatReading.ts`: `formatReadingLabel(chapters: readonly BibleChapterRef[]): string | null`.
  - `hooks/useTodayReading.ts`: `useTodayReading(): { label: string | null; target: { book: string; chapter: number } | null }`.
  - `components/player/ReadingOfTheDayCard.tsx`: `ReadingOfTheDayCard({ label, onPress }: { label: string; onPress: () => void })`.
  - `components/bible/BiblePanel.tsx`: prop opcional `initialReading?: { book: string; chapter: number } | null`.

- [ ] **Step 1: Escribe la prueba del formateador**

Crea `apps/mobile/tests/design/format-reading.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatReadingLabel } from '../../lib/formatReading';

const chapter = (book: string, chapterNumber: number, ordinal = 0) => ({
  ordinal,
  book,
  chapter: chapterNumber,
});

describe('formatReadingLabel', () => {
  it('returns null when there is no reading', () => {
    expect(formatReadingLabel([])).toBeNull();
  });

  it('names a single chapter', () => {
    expect(formatReadingLabel([chapter('Salmos', 23)])).toBe('Salmos 23');
  });

  it('collapses consecutive chapters of the same book into a range', () => {
    expect(formatReadingLabel([chapter('Salmos', 23), chapter('Salmos', 24)])).toBe('Salmos 23–24');
  });

  it('lists a gap inside the same book instead of pretending it is a range', () => {
    expect(formatReadingLabel([chapter('Salmos', 23), chapter('Salmos', 25)])).toBe('Salmos 23 · 25');
  });

  it('separates different books', () => {
    expect(formatReadingLabel([chapter('Salmos', 23), chapter('Juan', 3)])).toBe('Salmos 23 · Juan 3');
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/format-reading.test.ts"`
Expected: FAIL, no existe `lib/formatReading.ts`.

- [ ] **Step 3: Implementa `formatReadingLabel`**

Crea `apps/mobile/lib/formatReading.ts`. Recorre los capítulos en el orden recibido (el backend ya los entrega en orden canónico) agrupando por libro: dentro de un grupo, un capítulo consecutivo al anterior extiende el rango (`23–24`); un salto abre un segmento nuevo unido con ` · `. Los libros se unen con ` · `. El separador de rango es el guion de raya (`–`, U+2013), no el guion corto. Devuelve `null` para una lista vacía.

- [ ] **Step 4: Ejecuta la prueba del formateador**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/format-reading.test.ts"`
Expected: PASS, 5 pruebas.

- [ ] **Step 5: Añade el hook**

Crea `apps/mobile/hooks/useTodayReading.ts`. Pide `GET ${BACKEND_URL}/api/bible/reading/today` una vez al montar, tipado como `BibleReadingToday`. Devuelve `label` calculado con `formatReadingLabel(chapters)` y `target` con el primer capítulo (`{ book, chapter }`). Un `fetch` que falle, un `res.ok` falso o `reading === null` dejan ambos en `null` y no lanzan: la tarjeta simplemente no se pinta. No añadas reintentos ni polling.

Si `BibleReadingToday` no está exportado por `packages/types/src/index.ts`, añádelo a la lista de exports de `admin.ts` en ese índice.

- [ ] **Step 6: Crea la tarjeta**

Crea `apps/mobile/components/player/ReadingOfTheDayCard.tsx`. Un `Pressable` de ancho completo, `minHeight: 56`, `backgroundColor: Colors.inkElevated`, `borderRadius: Radii.md`, `borderWidth: 1`, `borderColor: Colors.borderGlass`, con `Ionicons name="book-outline" size={16} color={Colors.signal}`, una columna con la etiqueta "Lectura de hoy" (`Typography.caption`, `Colors.textMuted`) y el título (`Typography.bodyStrong`, `Colors.text`, `numberOfLines={1}`), y un `chevron-forward` a la derecha. `accessibilityRole="button"` y `accessibilityLabel={\`Lectura de hoy: ${label}. Abrir la Biblia\`}`.

- [ ] **Step 7: Cablea la tarjeta y el salto al capítulo**

En `BiblePanel.tsx` añade la prop `initialReading?: { book: string; chapter: number } | null` y un efecto que, al abrirse con un `initialReading` presente, llama `actions.setBook(initialReading.book)` y `actions.setChapter(initialReading.chapter)`. Depende de `isOpen`, de `initialReading?.book` y de `initialReading?.chapter`. Reabrir desde la tarjeta vuelve a ese capítulo a propósito: la tarjeta pidió ese capítulo.

En `(tabs)/index.tsx`: añade el estado `const [bibleTarget, setBibleTarget] = useState<{ book: string; chapter: number } | null>(null);`. Saca el `TouchableOpacity` de `bibleButton` de `topSection` —la píldora deja de flotar sobre el héroe— y monta, al final de `centerSection`, después de `{nextUpSong && <NextUpCard …/>}`, un ternario: si `label` no es `null`, `ReadingOfTheDayCard` con `onPress` que hace `setBibleTarget(target)` y `setShowBible(true)`; si es `null`, el mismo `TouchableOpacity` de antes con `onPress` que hace `setBibleTarget(null)` y `setShowBible(true)`. Los estilos `bibleButton` y `bibleButtonText` **no se borran**: viajan con el respaldo. Pasa `initialReading={bibleTarget}` a `BiblePanel`, que hoy recibe solo `isOpen` y `onClose`.

- [ ] **Step 8: Añade la prueba de cableado y de la etiqueta larga**

Amplía `apps/mobile/tests/design/format-reading.test.ts` con un `describe` que lea `components/player/ReadingOfTheDayCard.tsx` y `app/(tabs)/index.tsx` desde `import.meta.url` y afirme cuatro cosas: que la tarjeta pone `numberOfLines={1}` en la etiqueta; que `index.tsx` monta `ReadingOfTheDayCard`; que pasa `initialReading` a `BiblePanel`; y que el respaldo sigue existiendo —`index.tsx` contiene `bibleButton` y `setBibleTarget(null)`, que es el camino en que la Biblia se abre sin capítulo fijado—.

- [ ] **Step 9: Ejecuta la suite y los tipos**

Run: `cmd /c "cd apps\mobile && pnpm test"`
Expected: PASS, 6 archivos.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 10: Revisa los dos caminos en dispositivo**

Con la rotación bíblica activa, la tarjeta aparece con los capítulos de hoy, la etiqueta cabe en una línea en un teléfono de 320dp y al pulsarla la Biblia abre en ese capítulo. Sin rotación activa —o con el backend caído— la píldora "Biblia" vuelve y abre la última posición. Ninguno de los dos casos deja la pantalla con un hueco.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/lib/formatReading.ts apps/mobile/hooks/useTodayReading.ts apps/mobile/components/player/ReadingOfTheDayCard.tsx apps/mobile/components/bible/BiblePanel.tsx apps/mobile/app/"(tabs)"/index.tsx apps/mobile/tests/design/format-reading.test.ts
git commit -m "feat(mobile): surface the reading of the day in place of the floating bible pill"
```
