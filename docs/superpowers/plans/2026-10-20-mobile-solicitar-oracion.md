# Solicitar y Oración en la app móvil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en Solicitar el color vuelva a significar algo y que pedir una canción se confirme con calma, y que en Oración el aviso de datos sensibles deje de parecer un error y la pantalla empiece con un versículo y termine con una línea de acompañamiento.

**Architecture:** En Solicitar no se agrega ninguna pieza al modelo: la acción de pedir pasa de botón sólido a acción discreta y el color se queda para el estado pedido. La confirmación breve es un componente de aviso compartido, no un provider, porque solo hay dos sitios que lo necesitan hoy. En Oración el versículo sale de la misma fuente que la tarjeta "Lectura del día" del reproductor: los capítulos de hoy y el primer versículo de ese capítulo.

**Tech Stack:** React Native 0.86 + Expo 57, `expo-haptics`, Reanimated 4.5, Vitest 4 (entorno node), TypeScript estricto, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-20-mobile-design-system-design.md`, sección 6.

Consume `hooks/useTodayReading.ts` del plan del reproductor (`2026-10-20-mobile-player.md`, Task 5) y los tokens del plan del sistema visual. No depende de los planes de accesibilidad y movimiento.

## Global Constraints

- Sin dependencias nuevas de runtime ni de desarrollo.
- Ningún color literal en componentes.
- Los comentarios, JSDoc y descripciones de funciones se escriben en inglés (AGENTS.md). El copy que ve el oyente va en español y en mayúscula de oración.
- Área táctil mínima de 48dp en todo control nuevo o redimensionado.
- La háptica sigue la tabla del plan de accesibilidad: pedir una canción y enviar una oración son "éxito suave".
- Las pruebas son Vitest con `environment: "node"` y `include: ["tests/**/*.test.ts"]`: el cableado entre componentes se prueba como prueba de fuente con `readFileSync`, y la lógica pura se prueba importando el módulo.
- En esta máquina PowerShell bloquea `pnpm.ps1`. Todos los comandos se ejecutan como `cmd /c "cd apps\mobile && pnpm ..."`.
- Línea base verificada antes de empezar: `pnpm test` da 1 archivo y 4 pruebas en verde, y `pnpm exec tsc --noEmit` no imprime nada.

## Review Focus

1. **El aviso breve tiene que tapar la lista, no la barra.** Se muestra sobre la lista, por encima de la barra de pestañas, y desaparece solo. Prueba de Task 1.
2. **El lector de pantalla tiene que distinguir los dos estados.** Una fila sin pedir anuncia "Pedir {título}" y una fila ya pedida anuncia "Pedida: {título}". Prueba de Task 1.
3. **El aviso de consentimiento sigue siendo un error.** El texto informativo se vuelve neutro; el que bloquea el envío sigue en rojo. Prueba de Task 2.
4. **Sin versículo no hay hueco.** Cuando no hay rotación bíblica, cuando el backend no responde o cuando el nombre del libro no resuelve en la Biblia, la pantalla de Oración empieza igual que hoy. Prueba de Task 3.
5. **El versículo no puede empujar el formulario fuera de la pantalla.** Arriba del todo, como máximo dos líneas, y el formulario sigue siendo corto. Prueba de Task 3.

---

### Task 1: Pedir deja de ser el botón más pesado de la lista

Veinticinco botones sólidos de acento hacen que el color deje de significar "acción principal" y pase a ser textura. La acción se queda, discreta, y el color aparece cuando la canción ya está pedida.

**Files:**
- Create: `apps/mobile/components/ui/Snackbar.tsx`
- Modify: `apps/mobile/app/(tabs)/request.tsx` (`styles.btn`, `styles.btnSent`, `SongRow`, `handleRequest`)
- Test: `apps/mobile/tests/design/request-action.test.ts`

**Interfaces:**
- Consumes: `Colors.borderGlass`, `Colors.success`, `Colors.successMuted`, `Colors.textMuted`, `Colors.inkElevated` (existentes).
- Produces: `components/ui/Snackbar.tsx` con `Snackbar({ message, onHide }: { message: string | null; onHide: () => void })`. Es un componente tonto: si `message` es `null` no pinta nada, y si no es `null` se oculta solo a los 2600 ms llamando `onHide`. Es un snackbar y no un toast: en Android el feedback transitorio es un snackbar anclado abajo, y un toast flota sobre el contenido y tapa lo que acaba de pasar.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/request-action.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('request row action', () => {
  it('does not fill the row action with the accent', () => {
    const idle = read('app/(tabs)/request.tsx').match(/btn: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(idle).not.toMatch(/Colors\.signal/);
    expect(idle).toMatch(/Colors\.borderGlass/);
  });

  it('gives the colour to the sent state only', () => {
    const sent = read('app/(tabs)/request.tsx').match(/btnSent: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(sent).toMatch(/Colors\.success/);
  });

  it('announces the row as requested once it is sent', () => {
    expect(read('app/(tabs)/request.tsx')).toMatch(/Pedida: \$\{title\}/);
  });

  it('confirms the request with a soft success and a brief notice', () => {
    const screen = read('app/(tabs)/request.tsx');

    expect(screen).toMatch(/Haptics\.NotificationFeedbackType\.Success/);
    expect(screen).toMatch(/<Snackbar/);
    expect(read('components/ui/Snackbar.tsx')).toMatch(/2600/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/request-action.test.ts"`
Expected: FAIL. `btn` usa `Colors.signalFill`, no hay etiqueta "Pedida", no hay haptic de éxito y no existe `components/ui/Snackbar.tsx`.

- [ ] **Step 3: Crea el aviso breve**

Crea `apps/mobile/components/ui/Snackbar.tsx`. Un `Animated.View` posicionado con `position: 'absolute'`, `bottom: Spacing.xl`, `alignSelf: 'center'`, `paddingVertical: Spacing.sm`, `paddingHorizontal: Spacing.md`, `borderRadius: Radii.full`, `backgroundColor: Colors.inkElevated`, `borderWidth: 1`, `borderColor: Colors.borderGlass`, con un `Text` en `Typography.captionStrong` y `Colors.text`. Entra con `FadeIn.duration(180)` y sale con `FadeOut.duration(140)`. Si `message` es `null`, el componente devuelve `null`. Si no lo es, un `useEffect` con `setTimeout` de 2600 ms llama `onHide()` y limpia el temporizador al desmontar.

El componente no recibe estado de la pantalla: es tonto a propósito, para que Oración pueda usarlo igual más adelante.

- [ ] **Step 4: Cambia la acción a discreta**

En `app/(tabs)/request.tsx`:

- `styles.btn`: `backgroundColor: 'transparent'`, `borderWidth: 1`, `borderColor: Colors.borderGlass`, `borderRadius: 10`, `minHeight: 48`, `minWidth: 64`, `paddingHorizontal: 14`, centrado.
- `styles.btnSent`: `backgroundColor: Colors.successMuted` y `borderColor: Colors.success`.
- `styles.btnText`: `color: Colors.textMuted`.
- El glifo del estado pedida pasa a `Colors.success`.
- En `SongRow`, el `accessibilityLabel` pasa a `` isSent ? `Pedida: ${title}` : `Pedir ${title}` ``.
- En `handleRequest`, la rama `if (result.success)` añade `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})` y pone el mensaje del aviso: `` `${title} entra en la cola` ``. El `selectionAsync` del press se queda: son dos momentos distintos, y la tabla de háptica distingue el tic de la confirmación.
- La pantalla monta `<Snackbar message={snackbar} onHide={() => setSnackbar(null)} />` **fuera** de la `FlashList`, con el estado `const [snackbar, setSnackbar] = useState<string | null>(null);`. El `Snackbar` va por encima de la lista y por encima de la barra de pestañas: `bottom: Spacing.xl` dentro del contenido desplazable no serviría, así que el `Snackbar` se monta como hermano de la lista, con `pointerEvents="none"` para que no robe toques.

- [ ] **Step 5: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/request-action.test.ts"`
Expected: PASS, 4 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm test"`
Expected: PASS, 3 archivos.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 6: Verifica la fila en dispositivo**

Pide una canción: el botón pasa de contorno a verde con el check, la pantalla vibra con el éxito y aparece el aviso breve, que desaparece solo a los 2.6 segundos. Con lector de pantalla activo, una fila sin pedir anuncia "Pedir {título}" y una fila ya pedida anuncia "Pedida: {título}". La fila conserva 48dp de alto mínimo.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/components/ui/Snackbar.tsx apps/mobile/app/"(tabs)"/request.tsx apps/mobile/tests/design/request-action.test.ts
git commit -m "feat(mobile): make the request action quiet until the song is queued"
```

---

### Task 2: El aviso de datos sensibles deja de parecer un error

Hoy es una frase de 11px en `warning`, el mismo ámbar que el temporizador. Se lee como una alarma y compite con un color que tiene otro trabajo.

**Files:**
- Modify: `apps/mobile/app/(tabs)/prayer.tsx` (`sensitiveWarning` y el bloque que lo pinta)
- Test: `apps/mobile/tests/design/prayer-notice.test.ts`

**Interfaces:**
- Consumes: `Colors.info` (existente, hoy sin uso en la app).
- Produces: nada que otra tarea use.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/prayer-notice.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', '(tabs)', 'prayer.tsx'),
  'utf8',
);

describe('prayer sensitive-data notice', () => {
  it('reads as information, not as a warning', () => {
    const notice = source.match(/sensitiveWarning: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(notice).not.toMatch(/Colors\.warning/);
    expect(notice).toMatch(/Colors\.textMuted/);
    expect(source).toMatch(/information-circle-outline/);
  });

  it('leaves the consent error in danger', () => {
    const error = source.match(/errorText: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(error).toMatch(/Colors\.danger/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/prayer-notice.test.ts"`
Expected: FAIL. `sensitiveWarning` usa `Colors.warning` y no hay icono de información.

- [ ] **Step 3: Pinta el aviso como información**

Envuelve el `<Text style={styles.sensitiveWarning}>` en un `View` con `flexDirection: 'row'`, `gap: 6`, `marginTop: 6` y `alignItems: 'flex-start'`, con un `Ionicons name="information-circle-outline" size={14} color={Colors.info}` y `style={{ marginTop: 1 }}` para alinearlo con la primera línea. El `Text` toma `flex: 1`.

En `styles.sensitiveWarning`: `color: Colors.textMuted`, `fontSize: 12`, `lineHeight: 17`, y desaparece el `marginTop` (lo lleva el contenedor).

El error de consentimiento no se toca: sigue en `Colors.danger` y sigue debajo del campo que lo provoca.

- [ ] **Step 4: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/prayer-notice.test.ts"`
Expected: PASS, 2 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/"(tabs)"/prayer.tsx apps/mobile/tests/design/prayer-notice.test.ts
git commit -m "fix(mobile): present the sensitive-data notice as information instead of an alert"
```

---

### Task 3: Un versículo arriba y una línea de acompañamiento abajo

La pantalla de Oración es la más cálida de la app y hoy empieza con un formulario. El documento pide un versículo breve arriba y una confirmación serena con una línea de acompañamiento. El versículo sale de la misma fuente que la tarjeta "Lectura del día" del reproductor, así que no hay datos nuevos ni una segunda fuente de verdad.

**Files:**
- Create: `apps/mobile/lib/dailyVerse.ts`
- Create: `apps/mobile/hooks/useDailyVerse.ts`
- Modify: `apps/mobile/app/(tabs)/prayer.tsx` (versículo arriba, línea de acompañamiento en la confirmación)
- Test: `apps/mobile/tests/design/daily-verse.test.ts`

**Interfaces:**
- Consumes: `hooks/useTodayReading.ts` del plan del reproductor, que devuelve `{ label, target }` con `target = { book, chapter }` del capítulo de hoy. `BACKEND_URL` de `constants/api`. `BibleVerse` de `@radio/types`.
- Produces:
  - `lib/dailyVerse.ts`: `verseReference(book: string, chapter: number, verse: number): string` y `pickVerseText(verses: readonly BibleVerse[]): string | null`.
  - `hooks/useDailyVerse.ts`: `useDailyVerse(): { reference: string; text: string } | null`.

- [ ] **Step 1: Escribe la prueba que falla**

Crea `apps/mobile/tests/design/daily-verse.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pickVerseText, verseReference } from '../../lib/dailyVerse';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('daily verse', () => {
  it('names the verse the way a reader would', () => {
    expect(verseReference('Salmos', 23, 1)).toBe('Salmos 23:1');
  });

  it('takes the first verse that has text', () => {
    expect(pickVerseText([])).toBeNull();
    expect(pickVerseText([{ id: 'a', chapterId: 'c', number: 1, text: '  ' }])).toBeNull();
    expect(
      pickVerseText([
        { id: 'a', chapterId: 'c', number: 1, text: 'Jehová es mi pastor; nada me faltará.' },
      ])
    ).toBe('Jehová es mi pastor; nada me faltará.');
  });
});

describe('prayer screen', () => {
  it('shows the verse above the form and the reassurance after sending', () => {
    const screen = read('app/(tabs)/prayer.tsx');

    expect(screen).toMatch(/useDailyVerse/);
    expect(screen).toMatch(/Frase del día|lectura de hoy|Lectura de hoy/);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba para verla fallar**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/daily-verse.test.ts"`
Expected: FAIL, no existe `lib/dailyVerse.ts`.

- [ ] **Step 3: Implementa el módulo puro**

Crea `apps/mobile/lib/dailyVerse.ts`:

- `verseReference(book, chapter, verse)` devuelve `` `${book} ${chapter}:${verse}` ``.
- `pickVerseText(verses)` devuelve el texto del primer versículo cuyo `text` tenga algo que no sea espacio, o `null`.

- [ ] **Step 4: Ejecuta la prueba del módulo**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/daily-verse.test.ts"`
Expected: la mitad de módulo en PASS, la de pantalla en FAIL.

- [ ] **Step 5: Añade el hook**

Crea `apps/mobile/hooks/useDailyVerse.ts`. Llama a `useTodayReading()` y, cuando hay `target`, pide `GET ${BACKEND_URL}/api/bible/chapter?translation=RVR1960&book=${encodeURIComponent(target.book)}&chapter=${target.chapter}` una sola vez. De la respuesta toma `verses[0]` y devuelve `{ reference: verseReference(target.book, target.chapter, verses[0].number), text: pickVerseText(verses) }`.

Si no hay `target`, si la respuesta no es `ok`, si `verses` está vacío o si el texto viene vacío, devuelve `null` y no lanza. El nombre del libro que devuelve la rotación puede no coincidir con el de la Biblia: por eso el fallo es silencioso y la pantalla empieza igual que hoy.

No añadas reintentos, ni caché propia (la caché de capítulos ya vive en `useBible`), ni polling.

- [ ] **Step 6: Monta el versículo y la línea de acompañamiento**

En `app/(tabs)/prayer.tsx`:

- Arriba del todo, antes del encabezado del formulario, un bloque con el versículo cuando `verse` no es `null`: el texto en `Typography.display` (Fraunces) a `fontSize: 20`, `lineHeight: 30`, `color: Colors.text`, `textAlign: 'center'`, `numberOfLines={4}`; debajo, la referencia en `Typography.caption` y `Colors.textFaint`, también centrada. El bloque se separa del formulario con `marginBottom: Spacing.lg`. Si `verse` es `null`, no se pinta nada y el layout queda como hoy.
- En el estado de éxito, debajo del `successTitle` que ya existe, una línea con `Typography.body` y `Colors.textMuted`: "Recibimos tu petición. Alguien del equipo la está orando ahora." Sin confeti, sin animación nueva.

- [ ] **Step 7: Ejecuta la prueba y la suite**

Run: `cmd /c "cd apps\mobile && pnpm exec vitest run tests/design/daily-verse.test.ts"`
Expected: PASS, 3 pruebas.

Run: `cmd /c "cd apps\mobile && pnpm test"`
Expected: PASS, 4 archivos.

Run: `cmd /c "cd apps\mobile && pnpm exec tsc --noEmit"`
Expected: sin salida.

- [ ] **Step 8: Revisa los dos caminos en dispositivo**

Con la rotación bíblica activa, la pantalla empieza con el versículo del capítulo de hoy, en serif, y el formulario sigue siendo corto. Sin rotación, o con el backend caído, la pantalla empieza igual que hoy. Tras enviar, la confirmación muestra el título que ya tenía y la línea nueva debajo.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/lib/dailyVerse.ts apps/mobile/hooks/useDailyVerse.ts apps/mobile/app/"(tabs)"/prayer.tsx apps/mobile/tests/design/daily-verse.test.ts
git commit -m "feat(mobile): open the prayer screen with the reading of the day and close it with reassurance"
```
