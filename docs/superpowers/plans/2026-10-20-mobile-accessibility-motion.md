# Accesibilidad, movimiento y háptica de la app móvil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app se pueda usar con un dedo grande, con la fuente del sistema al 200 % y con "quitar animaciones" activado, y que la háptica signifique lo mismo en toda la app.

**Architecture:** Son cuatro arreglos mecánicos con una regla cada uno. Las áreas táctiles suben a 48dp, el escalado de fuente deja de romper las cajas de altura fija, las animaciones de Reanimated respetan la preferencia del sistema mediante un envoltorio global en lugar de setenta ediciones, y las 36 llamadas de háptica pasan por un módulo con cuatro respuestas nombradas. Ninguna tarea cambia el modelo de datos ni el flujo de la app.

**Tech Stack:** React Native 0.86 + Expo 57, Reanimated 4.5 (`ReducedMotionConfig`, `ReduceMotion`), `expo-haptics`, Vitest 4 (entorno node), TypeScript estricto, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-20-mobile-design-system-design.md`, sección 7.

No depende de los otros tres planes, salvo por los archivos que estos borran: la regla de 48dp se aplica a lo que exista cuando corra esta tarea.

## Global Constraints

- Sin dependencias nuevas de runtime ni de desarrollo.
- Ningún color literal en componentes.
- Los comentarios, JSDoc y descripciones de funciones se escriben en inglés (AGENTS.md).
- Las pruebas son Vitest con `environment: "node"` y `include: ["tests/**/*.test.ts"]`: las reglas de este plan se comprueban como invariantes de fuente, recorriendo los archivos de `apps/mobile` con `readdirSync`.
- En esta máquina PowerShell bloquea `pnpm.ps1`. Todos los comandos se ejecutan como `cmd /c "cd apps\mobile && pnpm ..."`.
- Línea base verificada antes de empezar: `pnpm test` da 1 archivo y 4 pruebas en verde, y `pnpm exec tsc --noEmit` no imprime nada.

## Review Focus

1. **Una lista de 25 filas no puede dejar de caber.** Subir las filas de 44 a 48dp cambia la densidad de Solicitar, Horarios y Oración: con 25 filas, la última tiene que seguir alcanzable con el pulgar y sin scroll infinito. Prueba de Task 1.
2. **La fuente al 200 % no puede recortar el texto del temporizador.** El selector de hora de Alarmas tiene filas de altura fija con texto dentro: a 200 % el texto se corta. Prueba de Task 2.
3. **Quitar animaciones no puede dejar la app en un estado intermedio.** Con la preferencia activada, las entradas de las hojas tienen que aparecer ya en su posición final, no a medio camino. Prueba de Task 3.
4. **La misma acción tiene que sentirse igual en todas partes.** Pedir una canción en Solicitar y guardar una alarma en Alarmas tienen que vibrar igual. Prueba de Task 4.
5. **El error tiene que sonar a error.** Cancelar algo no es un error: un rechazo, sí. La respuesta de error es un pulso doble, y no puede quedar ningún `notificationAsync(Warning)` en el código. Prueba de Task 4.

---

### Task 1: Áreas táctiles de 48dp

La app usa 44dp en las pestañas y en las listas, y la capa de hojas nunca se auditó: ahí hay botones de 40dp, chips de 38dp y controles de 24dp. El documento pide 48dp, que es el mínimo de Material y el que el sistema Android usa por omisión. La regla es una sola y se aplica a todo: **ningún control que se toque baja de 48dp**.

**Files:**
- Modify: los archivos de `apps/mobile` que hoy declaran `minHeight: 44` o `minWidth: 44` (los que sigan existiendo)
- Modify: `apps/mobile/components/bible/BibleSearch.tsx` (botón de 40dp)
- Modify: `apps/mobile/components/AlarmModal.tsx` (chip de día de 38dp)
- Modify: `apps/mobile/components/FacebookLivePlayer.tsx` (escape de ~20dp)
- Modify: `apps/mobile/app/prayer/[id].tsx` (botón "Volver")
- Test: `apps/mobile/tests/design/touch-targets.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada que otra tarea use.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/touch-targets.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

const sources = new Map(
  walk(appRoot).map((file) => [file.slice(appRoot.length + 1), readFileSync(file, 'utf8')]),
);

describe('touch targets', () => {
  it('has no target declared below 48dp', () => {
    const offenders = [...sources.entries()]
      .filter(([, source]) => /minHeight: 44|minWidth: 44/.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('keeps the small visual controls in the sheet layer at 48dp', () => {
    for (const file of [
      'components/bible/BibleSearch.tsx',
      'components/AlarmModal.tsx',
      'components/FacebookLivePlayer.tsx',
      'app/prayer/[id].tsx',
    ]) {
      expect(sources.get(file)).toMatch(/minHeight: 48|minWidth: 48|hitSlop/);
    }
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/touch-targets.test.ts"`
Expected: FAIL. La primera prueba lista los archivos con `minHeight: 44`; la segunda falla en al menos uno de los cuatro archivos de la capa de hojas.

- [ ] **Step 3: Sube todo a 48dp**

En cada archivo que declare `minHeight: 44` o `minWidth: 44`, el valor pasa a `48`. Es un cambio mecánico, sin revisar la estética de cada sitio: la regla es el piso, no un diseño.

En los cuatro archivos de la capa de hojas:

- `BibleSearch.tsx`: el botón de 40×40 pasa a 48×48 (`width` y `height` a 48, o `minWidth`/`minHeight` a 48 conservando el tamaño del glifo).
- `AlarmModal.tsx`: el chip de día de 38×38 pasa a 48×48. Los chips de atajo ("Todos", "Fines de semana") ya son filas y no se tocan.
- `FacebookLivePlayer.tsx`: el escape del reproductor embebido, que hoy mide unos 20dp, pasa a `minHeight: 48` con `hitSlop` para que el dedo lo alcance sin agrandar el icono.
- `app/prayer/[id].tsx`: el botón "Volver", que hoy mide unos 20dp de alto, pasa a `minHeight: 48`.

Cuando un control debe seguir siendo visualmente pequeño (un icono dentro de una hoja), el área táctil se agranda con `hitSlop`, no con el icono.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/touch-targets.test.ts"`
Expected: PASS, 2 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Revisa las listas largas**

Abre Solicitar, Horarios, Oración y Mis peticiones con la fuente del sistema al máximo. Las filas de 48dp tienen que caber: en Solicitar, la última de la página tiene que quedar a un pulgar del borde inferior sin que la lista crezca de forma que obliga a un scroll eterno.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "fix(mobile): raise every touch target to 48dp"
```

---

### Task 2: El escalado de fuente no rompe la geometría fija

No hay `maxFontSizeMultiplier` en ninguna parte salvo la barra de pestañas, y el texto escala sin límite dentro de cajas de altura fija: las filas de 44dp del selector de hora de Alarmas cortan el texto a 200 %. La regla es una: **una caja de altura fija no contiene texto sin tope de escala**.

**Files:**
- Modify: `apps/mobile/components/alarm/TimeWheelPicker.tsx` (altura de fila y tope de escala)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (tope de escala en los textos de tamaño fijo del reproductor)
- Test: `apps/mobile/tests/design/font-scaling.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada que otra tarea use.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/font-scaling.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('font scaling', () => {
  it('never disables the system font scale', () => {
    expect(read('app/(tabs)/_layout.tsx')).not.toMatch(/allowFontScaling=\{false\}/);
    expect(read('components/alarm/TimeWheelPicker.tsx')).not.toMatch(/allowFontScaling=\{false\}/);
  });

  it('grows the fixed rows of the time wheel instead of clipping them', () => {
    const picker = read('components/alarm/TimeWheelPicker.tsx');

    expect(picker).not.toMatch(/^\s*height: 44,/m);
    expect(picker).toMatch(/minHeight: 48/);
    expect(picker).toMatch(/maxFontSizeMultiplier/);
  });

  it('caps the scale of the text inside the player fixed geometry', () => {
    expect(read('app/(tabs)/index.tsx')).toMatch(/maxFontSizeMultiplier/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/font-scaling.test.ts"`
Expected: FAIL en las dos últimas; la primera ya pasa.

- [ ] **Step 3: Deja que las cajas crezcan y topa la escala donde no cabe**

En `TimeWheelPicker.tsx`: la fila de opción pasa de `height: 44` a `minHeight: 48`, y el `Text` de la fila lleva `maxFontSizeMultiplier={1.3}`. El valor 1.3 es el que ya usa la barra de pestañas como referencia: por encima de eso, los números de dos dígitos no caben en la rueda.

En `(tabs)/index.tsx`: los textos que viven en cajas de tamaño fijo (el rótulo del disco, el badge de error y el texto del botón de reintento) llevan `maxFontSizeMultiplier={1.4}`. El título de la canción y el nombre del artista, que viven en cajas que ya crecen, no llevan tope.

No añadas `allowFontScaling={false}` en ningún sitio: la app debe dejar que la fuente crezca.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/font-scaling.test.ts"`
Expected: PASS, 3 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Revisa con la fuente al máximo**

Sube la fuente del sistema al máximo en Android y revisa el selector de hora de Alarmas, el reproductor y el formulario de Oración. Ningún texto puede quedar cortado ni tapar el control de al lado.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/alarm/TimeWheelPicker.tsx apps/mobile/app/"(tabs)"/index.tsx apps/mobile/tests/design/font-scaling.test.ts
git commit -m "fix(mobile): let the system font scale without clipping fixed geometry"
```

---

### Task 3: Las animaciones respetan "quitar animaciones"

El P0 de la crítica interna sigue abierto: hay 77 animaciones de layout y ninguna consulta la preferencia del sistema. El modelo está invertido: el oyente que pide menos movimiento pierde el vinilo (inofensivo) y recibe las 49 entradas con desplazamiento a pleno. Reanimated 4 resuelve esto de una vez, sin editar setenta sitios.

**Files:**
- Modify: `apps/mobile/app/_layout.tsx` (envoltorio `ReducedMotionConfig`)
- Modify: `apps/mobile/components/player/DialVivo.tsx` (usar el hook compartido)
- Modify: `apps/mobile/components/player/NextUpCard.tsx` (usar el hook compartido)
- Modify: `apps/mobile/components/player/NowPlayingInfo.tsx` (usar el hook compartido)
- Modify: `apps/mobile/components/LiveBadge.tsx` (usar el hook compartido)
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (usar el hook compartido)
- Modify: `apps/mobile/components/FacebookLivePlayer.tsx` (el pulso del vivo deja de ser un círculo estático)
- Test: `apps/mobile/tests/design/reduced-motion.test.ts`

**Interfaces:**
- Consumes: `hooks/useReducedMotion.ts` (existente).
- Produces: nada que otra tarea use.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/reduced-motion.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('reduced motion', () => {
  it('lets reanimated honour the system setting for every animation', () => {
    const layout = read('app/_layout.tsx');

    expect(layout).toMatch(/ReducedMotionConfig/);
    expect(layout).toMatch(/ReduceMotion\.System/);
  });

  it('keeps one source for the preference', () => {
    for (const file of [
      'components/player/DialVivo.tsx',
      'components/player/NextUpCard.tsx',
      'components/player/NowPlayingInfo.tsx',
      'components/LiveBadge.tsx',
      'app/(tabs)/_layout.tsx',
    ]) {
      expect(read(file)).toMatch(/useReducedMotion/);
      expect(read(file)).not.toMatch(/isReduceMotionEnabled/);
    }
  });

  it('wakes the live moment up instead of showing a static circle', () => {
    const player = read('components/FacebookLivePlayer.tsx');

    expect(player).toMatch(/withRepeat/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verra fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/reduced-motion.test.ts"`
Expected: FAIL en las tres. No hay `ReducedMotionConfig`, cinco archivos consultan la preferencia por su cuenta y el reproductor de Facebook no tiene ninguna animación.

- [ ] **Step 3: Aplica la preferencia global**

En `app/_layout.tsx`: importa `ReducedMotionConfig` y `ReduceMotion` de `react-native-reanimated` y envuelve el árbol de la app en `<ReducedMotionConfig mode={ReduceMotion.System} />`. Con eso, las 77 animaciones de layout y las animaciones de valores compartidos respetan la preferencia del sistema, y las entradas con desplazamiento pasan a aparecer en su sitio sin desplazarse.

En los cinco archivos que consultan la preferencia por su cuenta (`DialVivo.tsx`, `NextUpCard.tsx`, `NowPlayingInfo.tsx`, `LiveBadge.tsx`, `_layout.tsx`): borra el `useEffect` con `AccessibilityInfo.isReduceMotionEnabled` y usa `hooks/useReducedMotion.ts`, que ya sigue los cambios del sistema en vivo. Los cinco deben terminar importando el hook y ninguno puede seguir llamando a `AccessibilityInfo.isReduceMotionEnabled`.

`DialVivo.tsx` es el caso particular: usa un `useSharedValue` para la preferencia porque el valor vive dentro de worklets. Conserva el `useSharedValue`, pero su valor pasa a venir del hook en un `useEffect` (`reduceMotion.value = reduced`), con el mismo `reduceMotionChanged` que ya escucha el hook.

En `FacebookLivePlayer.tsx`: el pulso del directo deja de ser un círculo estático. Copia el patrón exacto de `components/LiveBadge.tsx`: `withRepeat(withTiming(1.8, { duration: 900 }), -1, false)` sobre la escala y `withRepeat(withTiming(0, { duration: 900 }), -1, false)` sobre la opacidad, con `entering={FadeIn.duration(260)}` en el contenedor. Son unas ocho líneas.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/reduced-motion.test.ts"`
Expected: PASS, 3 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Revisa con la preferencia activada**

Activa "Quitar animaciones" en los ajustes de Android y abre las cinco pantallas con entradas (Solicitar, Oración, Horarios, Redes, el reproductor). Nada debe entrar desplazándose, nada debe quedarse a medio camino y el directo de Facebook debe seguir respirando: es una señal de que la emisión está viva, no un adorno.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app apps/mobile/components apps/mobile/tests/design/reduced-motion.test.ts
git commit -m "fix(mobile): honour the system reduced-motion preference across every animation"
```

---

### Task 4: Una sola voz en la háptica

Hoy hay 36 llamadas de `expo-haptics` repartidas sin criterio: `selectionAsync` en casi todo, `impactAsync(Light)` en unos pocos, `notificationAsync(Success)` en tres sitios y `notificationAsync(Warning)` para los errores. La tabla del documento se codifica en un módulo con cuatro respuestas nombradas y los sitios se alinean a ella.

**Files:**
- Create: `apps/mobile/lib/haptics.ts`
- Modify: los archivos de `apps/mobile` que llaman a `Haptics.` directamente
- Test: `apps/mobile/tests/design/haptics.test.ts`

**Interfaces:**
- Consumes: `expo-haptics` (dependencia ya instalada).
- Produces: `lib/haptics.ts` con cuatro funciones: `tick(): void` (selector o interruptor), `click(): void` (reproducir o pausar), `success(): void` (guardar, pedir, enviar) y `error(): void` (petición rechazada).

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/haptics.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === 'tests' || entry === 'node_modules') return [];
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

const sources = new Map(
  walk(appRoot).map((file) => [file.slice(appRoot.length + 1), readFileSync(file, 'utf8')]),
);

describe('haptics', () => {
  it('has one module with the four responses', () => {
    const module = sources.get('lib/haptics.ts') ?? '';

    expect(module).toMatch(/export function tick/);
    expect(module).toMatch(/export function click/);
    expect(module).toMatch(/export function success/);
    expect(module).toMatch(/export function error/);
  });

  it('never calls expo-haptics outside that module', () => {
    const offenders = [...sources.entries()]
      .filter(([file, source]) => file !== 'lib/haptics.ts' && /Haptics\./.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('does not use the warning notification as an error', () => {
    expect(sources.get('lib/haptics.ts')).not.toMatch(/NotificationFeedbackType\.Warning/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/haptics.test.ts"`
Expected: FAIL. No existe `lib/haptics.ts` y hay dieciséis archivos llamando a `Haptics.` directamente.

- [ ] **Step 3: Crea el módulo**

Crea `apps/mobile/lib/haptics.ts`:

- `tick()`: `Haptics.selectionAsync().catch(() => {})`.
- `click()`: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})`.
- `success()`: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})`.
- `error()`: dos pulsos cortos: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})` y, 90 ms después, el mismo pulso otra vez, programado con `setTimeout`. Si llegan dos errores seguidos, el temporizador del segundo cancela al del primero con `clearTimeout`, de modo que nunca se solapan dos pulsos dobles.

Ninguna función lanza: la vibración es un adorno y no puede romper una interacción.

- [ ] **Step 4: Alinea los sitios**

En cada archivo que llama a `Haptics.` directamente, sustituye la llamada por la respuesta que le corresponde:

| Sitio | Respuesta |
|---|---|
| Selectores, interruptores, chips de día, filas de una lista (`schedule.tsx`, `request.tsx`, `_layout.tsx`, `social.tsx`, `NotificationsModal` o su equivalente, `QualityModal` o su equivalente, `SleepTimerModal` o su equivalente, `prayer.tsx`, `feedback.tsx`) | `tick()` |
| Reproducir y pausar (`PlayerControls.tsx`) | `click()` |
| Guardar una alarma o un recordatorio (`AlarmModal.tsx`) | `success()` |
| Pedir una canción (`request.tsx`) | `success()` |
| Enviar una oración (`prayer.tsx`) | `success()` |
| Cancelar un temporizador (`SleepTimerBubble.tsx`, hoja del temporizador) | `tick()`: cancelar no es un error |
| Petición rechazada o fallo de guardado | `error()` |

El corazón de favoritos, que hoy usa `impactAsync(Light)` con una secuencia de muelle, pasa a `click()`: es una acción, no un error ni un interruptor.

- [ ] **Step 5: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/haptics.test.ts"`
Expected: PASS, 3 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 6: Revisa la coherencia en dispositivo**

Pide una canción, guarda una alarma, cambia un chip de día, reproduce y pausa, y rechaza una petición (por ejemplo, pidiendo una canción que ya está en la cola). Las cuatro respuestas tienen que sonar distintas entre sí y ser iguales en cualquier pantalla donde ocurra la misma acción.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/lib/haptics.ts apps/mobile
git commit -m "refactor(mobile): give haptics a single vocabulary of four responses"
```

---

### Task 5: Esqueletos donde hoy hay un vacío

El reproductor ya tiene esqueletos (`components/ui/ShimmerBox`), pero Solicitar, Horarios y Redes muestran un espacio vacío mientras cargan. Un vacío no dice "está cargando"; un esqueleto sí.

**Files:**
- Modify: `apps/mobile/app/(tabs)/request.tsx` (estado de carga de la lista)
- Modify: `apps/mobile/app/(tabs)/schedule.tsx` (estado de carga del día)
- Modify: `apps/mobile/app/(tabs)/social.tsx` (estado de carga de las tarjetas)
- Test: `apps/mobile/tests/design/loading-skeletons.test.ts`

**Interfaces:**
- Consumes: `components/ui/ShimmerBox` (existente) y `Colors.surfaceGlass` (existente).
- Produces: nada que otra tarea use.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/loading-skeletons.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('loading states', () => {
  it('paints a skeleton instead of an empty space', () => {
    for (const file of [
      'app/(tabs)/request.tsx',
      'app/(tabs)/schedule.tsx',
      'app/(tabs)/social.tsx',
    ]) {
      expect(read(file)).toMatch(/ShimmerBox/);
    }
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/loading-skeletons.test.ts"`
Expected: FAIL en las tres pantallas.

- [ ] **Step 3: Añade los esqueletos**

En cada una de las tres pantallas, el estado de carga deja de ser un `ActivityIndicator` suelto o un `View` vacío y pasa a un esqueleto con `ShimmerBox`, con la misma forma que el contenido que va a aparecer: filas en Solicitar, bloques de horario en Horarios y tarjetas en Redes. Reutiliza el patrón del reproductor: `backgroundColor: Colors.surfaceGlass`, `borderRadius: 6`, con la altura de la fila real.

En Solicitar, que es una `FlashList`, el esqueleto se pinta fuera de la lista (la lista no debe renderizar celdas de esqueleto, porque se reciclan y parpadean). En Horarios y Redes, el esqueleto sustituye al `ActivityIndicator` dentro del contenedor del estado de carga.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/loading-skeletons.test.ts"`
Expected: PASS, 1 prueba.

Run: `cmd /c "cd apps\mobile && pnpm test"`
Expected: PASS, 5 archivos.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/"(tabs)"/request.tsx apps/mobile/app/"(tabs)"/schedule.tsx apps/mobile/app/"(tabs)"/social.tsx apps/mobile/tests/design/loading-skeletons.test.ts
git commit -m "feat(mobile): paint skeletons instead of empty space while the lists load"
```
