# Sala de carga: entorno visual para k6 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar al operador una pantalla local donde seguir una prueba de carga en vivo, verla con gráficas claras después y cambiar parámetros sin editar archivos.

**Architecture:** una app de Vite + React + TypeScript en `apps/load-room` consume un servidor Node local en `scripts/loadtest/control-room/server.mjs`. El servidor lee los JSON incrementales y el CSV que ya produce el arnés, lanza `run.mjs` como hijo, publica eventos por SSE y mantiene la configuración no secreta en `settings.json`. La UI muestra series temporales, mapa de calor, curva de capacidad, comparación de caminos y un diagrama de flujo con el estado de cada nodo.

**Tech Stack:** Node 20+ con módulos nativos (`http`, `child_process`, `fs`), React 19, Vite 7, TypeScript 5.9, Tailwind 3, Recharts 2.15 (ya presente en `apps/web`), Vitest 4, pnpm 10.11.

**Spec:** `docs/superpowers/specs/2026-11-27-k6-control-room-design.md`

## Global Constraints

- k6 es un binario nativo instalado con `winget install k6`; `k6 version` es prerrequisito. `pnpm exec k6` no funciona.
- El generador es Windows nativo, sin WSL. Las rutas relativas parten de la raíz del repo.
- `run.mjs` sigue siendo el único punto que lanza k6; la UI nunca invoca `k6 run` directamente.
- El servidor escucha solo en `127.0.0.1` y exige la cabecera `x-load-room-token` con el token aleatorio que imprime al arrancar.
- Ningún secreto se escribe en `settings.json`, `localStorage`, logs ni reportes. `POST /api/secrets` solo cambia variables del proceso en memoria y la UI muestra `configured`/`missing`, nunca valores.
- Los perfiles de escritura mantienen `K6_ALLOW_WRITES=1` y la guarda de `K6_EMAIL_CHECK_COMMAND`; la UI no relaja ninguna guarda.
- `K6_PATH` sigue siendo `edge` u `origin`; ninguna gráfica mezcla las dos curvas en un mismo eje.
- Los 429 son limitación de nginx y se presentan separados de los errores del backend.
- La UI no se despliega en producción y no toca nginx, PM2 ni `apps/web`.
- TypeScript-first, Tailwind para estilos, `pnpm install` necesario antes de ejecutar los scripts del workspace.

## Review Focus

- Un secreto escrito en `settings.json` o enviado por SSE: el operador lo ve filtrado en un reporte. Se fija en la Tarea 2 con `saveSettings()` que rechaza claves `K6_*` de secreto y con `secretStatus()` que devuelve solo booleanos, cada una con prueba.
- Un gráfico que mezcla `edge` y `origin`: una conclusión de capacidad sin camino identifiable. Se fija en la Tarea 1 con `splitByPath()` y en la Tarea 5 con `buildPathComparison()` que devuelve dos series separadas, cada una con prueba.
- 429 contados como fallo del backend en el gráfico de errores: el operador culpa a Prisma por culpa de nginx. Se fija en la Tarea 1 con `aggregatePoints()` que mantiene `errorRate` y `throttledRate` como campos distintos, con prueba.
- Un JSON truncado por `.stop` que rompe el stream en vivo: la pantalla se queda vacía justo cuando la prueba se cortó. Se fija en la Tarea 1 con `parsePointLine()` que ignora líneas incompletas y en la Tarea 3 con el evento `state` que marca la corrida como `truncated`, cada una con prueba.
- El formulario generando flags inválidos para capacidad: `--vus` y `--vus-max` peleando otra vez. Se fija en la Tarea 2 con `buildRunArgs()` que ignora `vus` en perfiles `capacity*` y valida perfil/camino, con prueba.

---

### Task 1: Modelo de datos y agregadores

**Files:**
- Create: `apps/load-room/package.json`, `apps/load-room/tsconfig.json`, `apps/load-room/vite.config.ts`, `apps/load-room/index.html`, `apps/load-room/tailwind.config.js`, `apps/load-room/postcss.config.js`
- Create: `apps/load-room/src/lib/types.ts`, `apps/load-room/src/lib/points.ts`, `apps/load-room/src/lib/series.ts`
- Test: `apps/load-room/src/lib/points.test.ts`, `apps/load-room/src/lib/series.test.ts`

**Interfaces:**
- Consumes: eventos `Point` de `reports/*.json` con `data.time` RFC3339 o numérico, `data.value`, `data.tags`; CSV de `scripts/loadtest/monitor/collect.sh` con cabecera `ts,cpu_pct,rss_kb,mem_available_kb,mem_total_kb,net_rx_bytes,net_tx_bytes,restarts`. Los nombres de tag ya existen en el arnés: `path` vale `edge` u `origin`, `endpoint` es la ruta base (por ejemplo `/api/nowplaying`), `name` el nombre corto, `cache` es `cold`/`warm`/`none`, `throttled` es `yes`/`no`, `stage` lo escribe `tagWithCurrentStageIndex()` y `surface` vale `public`/`admin`/`worker`. El contador `throttled_requests` de `lib/http.js` se incrementa solo en 429 con `throttled:"yes"`; `http_req_failed` ya excluye los 429 mediante `expectedStatuses`. No se inventa otra fuente para 429.
- Produces: `K6Point`, `SeriesBucket`, `VpsBucket`, `parsePointLine(line: string): K6Point | null`, `aggregatePoints(points: K6Point[], bucketMs?: number): SeriesBucket[]`, `splitByPath(points: K6Point[]): Record<"edge" | "origin", K6Point[]>`, `aggregateVpsCsv(rows: CsvRow[]): VpsBucket[]`.

- [ ] **Step 1: escribir la prueba que falla para el parser de puntos**

```ts
it("parses RFC3339 k6 timestamps and ignores incomplete lines", () => {
  expect(parsePointLine('{"type":"Point","metric":"http_req_duration","data":{"time":"2026-11-26T12:00:00Z","value":100,"tags":{"path":"origin"}}}'))
    .toEqual({ metric: "http_req_duration", time: Date.parse("2026-11-26T12:00:00Z"), value: 100, tags: { path: "origin" } });
  expect(parsePointLine('{"type":"Point","metric":"http_req_duration"')).toBeNull();
});
```

- [ ] **Step 2: ejecutar la prueba y verla fallar**

Run: `pnpm --filter @radio/load-room test src/lib/points.test.ts`
Expected: FAIL porque `parsePointLine` no existe.

- [ ] **Step 3: implementar los tipos y el parser**

Definir `K6Point` con `metric: string`, `time: number`, `value: number`, `tags: Record<string, string>`. Aceptar `data.time` string con `Date.parse` y numérico; devolver `null` si falta `data`, si el JSON está cortado o si el tiempo no es finito. El scaffold del workspace se llama `@radio/load-room`, usa las mismas versiones de dependencias que `apps/web` y un `tsconfig.json` con `strict: true`.

- [ ] **Step 4: ejecutar la prueba y verla pasar**

Run: `pnpm --filter @radio/load-room test src/lib/points.test.ts`
Expected: PASS 1/1.

- [ ] **Step 5: escribir la prueba que falla para la agregación**

```ts
it("keeps backend errors and nginx throttling as separate series", () => {
  const buckets = aggregatePoints([
    { metric: "http_req_duration", time: 0, value: 100, tags: { path: "edge", stage: "0" } },
    { metric: "http_req_duration", time: 1000, value: 300, tags: { path: "edge", stage: "0" } },
    { metric: "http_req_failed", time: 1000, value: 1, tags: { path: "edge" } },
    { metric: "throttled_requests", time: 1000, value: 1, tags: { path: "edge", throttled: "yes" } },
  ]);
  expect(buckets[0].p95).toBe(300);
  expect(buckets[0].errorRate).toBe(1);
  expect(buckets[0].throttledRate).toBeGreaterThan(0);
  expect(splitByPath([{ metric: "http_reqs", time: 0, value: 1, tags: { path: "origin" } }]).edge).toEqual([]);
});
```

- [ ] **Step 6: ejecutar la prueba y verla fallar**

Run: `pnpm --filter @radio/load-room test src/lib/series.test.ts`
Expected: FAIL porque `aggregatePoints` no existe.

- [ ] **Step 7: implementar `aggregatePoints`, `splitByPath` y `aggregateVpsCsv`**

`SeriesBucket` tiene `t`, `rps`, `p50`, `p95`, `p99`, `errorRate`, `throttledRate`, `vus`, `stage`. Agrupar por `bucketMs` (por defecto 5000). `rps` = muestras de `http_req_duration` / segundos del bucket. `errorRate` viene de `http_req_failed`; `throttledRate` de `throttled_requests`, nunca de `http_req_failed`. `VpsBucket` tiene `t`, `cpuPct`, `memAvailablePct`, `netRx`, `netTx`, `restarts`.

- [ ] **Step 8: ejecutar las pruebas y verlas pasar**

Run: `pnpm --filter @radio/load-room test src/lib`
Expected: PASS, todas las pruebas de `points` y `series`.

- [ ] **Step 9: commit**

```bash
git add apps/load-room
git commit -m "feat(load-ui): add local workspace and k6 series aggregators"
```

### Task 2: Servidor local, parametros y streaming

**Files:**
- Create: `scripts/loadtest/control-room/server.mjs`, `scripts/loadtest/control-room/lib/args.mjs`, `scripts/loadtest/control-room/lib/settings.mjs`
- Test: `scripts/loadtest/tests/control-room.test.mjs`

**Interfaces:**
- Consumes: `parseRunArgs`, `PROFILES` de `scripts/loadtest/lib/cli.js`; `run.mjs <profile> [flags]`; `parseK6Points`, `parseMetricsCsv`, `correlate`, `findSaturation` y `renderReport` de `scripts/loadtest/monitor/correlate.mjs`. `CorrelatedRow` tiene `minute`, `stage`, `p95Ms`, `errorRate`, `rps`, `cpuPct`, `memAvailablePct`, `restarts`, `droppedIterations` e `iterationDurationMs`; no tiene `path`, así que el servidor lo deriva del nombre del JSON y devuelve `CorrelatedRow & { path: "edge" | "origin" }`.
- Produces: `buildRunArgs(settings: Settings): { profile: string, flags: string[] }`, `maskSecret(value: string | undefined): "configured" | "missing"`, `validateSettings(input: unknown): Settings`, rutas `GET /api/state`, `GET /api/stream`, `POST /api/run`, `POST /api/stop`, `GET|POST /api/settings`, `POST /api/secrets`, `GET /api/correlate`. `GET /api/correlate` devuelve `{ rows: Array<CorrelatedRow & { path: "edge" | "origin" }>, saturation: { minute: number, reason: string } | null }`; `saturation` es el resultado de `findSaturation(rows, K6_BASELINE_RESTARTS)`, la misma función que usa el CLI.

- [ ] **Step 1: escribir la prueba que falla para los flags**

```ts
it("uses vus-max as the only VU source for capacity profiles", () => {
  expect(buildRunArgs({ profile: "capacity", path: "origin", vusMax: 1600, instances: 2, vus: 10 }))
    .toEqual({ profile: "capacity", flags: ["--path", "origin", "--vus-max", "1600", "--instances", "2"] });
});

it("rejects an invalid profile or path", () => {
  expect(() => buildRunArgs({ profile: "other", path: "edge" })).toThrow(/profile/);
  expect(() => buildRunArgs({ profile: "smoke", path: "tunnel" })).toThrow(/path/);
});
```

- [ ] **Step 2: ejecutar la prueba y verla fallar**

Run: `node --test scripts/loadtest/tests/control-room.test.mjs`
Expected: FAIL porque `buildRunArgs` no existe.

- [ ] **Step 3: implementar `buildRunArgs`**

Usar `PROFILES` y `parseRunArgs` del arnés como única fuente de nombres de perfil y validación. Para perfiles que empiezan por `capacity`, omitir `vus` y emitir `--vus-max` e `--instances`; para los demás emitir `--vus` y `--duration`.

- [ ] **Step 4: ejecutar la prueba y verla pasar**

Run: `node --test scripts/loadtest/tests/control-room.test.mjs`
Expected: PASS.

- [ ] **Step 5: escribir la prueba que falla para secretos y configuración**

```ts
it("never persists secret keys", () => {
  expect(() => validateSettings({ profile: "smoke", K6_ADMIN_TOKEN: "abc" })).toThrow(/secret/);
  expect(validateSettings({ profile: "smoke", path: "edge", vus: 5 })).toMatchObject({ profile: "smoke", path: "edge" });
});

it("reports secrets as presence only", () => {
  expect(maskSecret("super-secret")).toBe("configured");
  expect(maskSecret(undefined)).toBe("missing");
});
```

- [ ] **Step 6: ejecutar la prueba y verla fallar**

Run: `node --test scripts/loadtest/tests/control-room.test.mjs`
Expected: FAIL porque `validateSettings` y `maskSecret` no existen.

- [ ] **Step 7: implementar la validación y el servidor**

`validateSettings` usa una lista blanca de claves (`profile`, `path`, `vus`, `duration`, `vusMax`, `instances`) y rechaza cualquier clave que empiece por `K6_` o contenga `secret`. `maskSecret` solo devuelve `"configured" | "missing"`. El servidor enlaza `127.0.0.1`, imprime el token al arrancar, sirve `apps/load-room/dist`, y publica por SSE `state`, `points`, `csv`, `log`. Inyecta el token en el HTML servido como `window.__LOAD_ROOM_TOKEN__` para que la UI lo envíe en la cabecera `x-load-room-token` sin campo de texto ni `localStorage`. `POST /api/secrets` acepta `{ key: "K6_ADMIN_TOKEN" | "K6_WORKER_SECRET" | "K6_PANEL_SECRET", value: string }` y asigna solo `process.env[key]` del servidor, nunca un archivo; las claves maestras `JWT_SECRET`, `WORKER_AUTH_SECRET` y `PANEL_SECRET` no se aceptan. `POST /api/run` lanza `node scripts/loadtest/run.mjs` con `stdio` pipe y heredando el entorno del proceso; `POST /api/stop` escribe `scripts/loadtest/.stop`; `GET /api/correlate` llama a las funciones exportadas de `correlate.mjs` y devuelve `{ rows, saturation }`.

- [ ] **Step 8: ejecutar la prueba y verla pasar**

Run: `node --test scripts/loadtest/tests/control-room.test.mjs`
Expected: PASS.

- [ ] **Step 9: commit**

```bash
git add scripts/loadtest/control-room scripts/loadtest/tests
git commit -m "feat(load-ui): add local control server with SSE and guarded settings"
```

### Task 3: Cascarón de la app, parametros y flujo en vivo

**Files:**
- Create: `apps/load-room/src/main.tsx`, `apps/load-room/src/App.tsx`, `apps/load-room/src/index.css`
- Create: `apps/load-room/src/hooks/useRunStream.ts`, `apps/load-room/src/components/RunHeader.tsx`, `apps/load-room/src/components/ParameterPanel.tsx`, `apps/load-room/src/components/FlowDiagram.tsx`
- Test: `apps/load-room/src/hooks/useRunStream.test.ts`

**Interfaces:**
- Consumes: `GET /api/state`, `GET /api/stream`, `POST /api/run`, `POST /api/stop`, `GET|POST /api/settings` de la Tarea 2. El servidor construye `RunState` de esta forma exacta: `profile` y `path` de los flags enviados, `marker` del stdout de `run.mjs` (`K6_MARKER=<n>`), `startedAt` del `Date.now()` del spawn, `stage` del último `tags.stage` recibido, `vus` del objetivo de ese escalón en `buildStages()`, `instance` del sufijo `-iN-` del JSON, `status` del evento `exit` del hijo y `elapsedSec` calculado. No se parsean archivos de configuración para el estado.
- Produces: `RunState = { profile, path, marker, startedAt, elapsedSec, stage, vus, instance, status: "idle" | "running" | "truncated" | "finished" }`, `reduceRunState(state: RunState, event: StreamEvent): RunState`, `useRunStream(): { state: RunState, points: K6Point[], csv: VpsBucket[], log: string[], connect(): void }`; `<ParameterPanel settings onRun onStop secretStatus />`; `<FlowDiagram state />`.

- [ ] **Step 1: escribir la prueba que falla para el estado truncado**

```ts
it("marks a run truncated when the stop sentinel is observed", () => {
  expect(reduceRunState({ status: "running" }, { type: "stop" }))
    .toMatchObject({ status: "truncated" });
});
```

- [ ] **Step 2: ejecutar la prueba y verla fallar**

Run: `pnpm --filter @radio/load-room test src/hooks`
Expected: FAIL porque `reduceRunState` no existe.

- [ ] **Step 3: implementar el reductor y el hook**

`reduceRunState` es una función pura que atiende los eventos SSE `state`, `points`, `csv`, `log`, `stop`. El hook abre `EventSource('/api/stream')`, aplica el reductor y expone los arrays accumulados; al recibir `stop` deja de acumular puntos pero conserva los ya vistos.

- [ ] **Step 4: ejecutar la prueba y verla pasar**

Run: `pnpm --filter @radio/load-room test src/hooks`
Expected: PASS.

- [ ] **Step 5: construir la pantalla**

La UI lee `window.__LOAD_ROOM_TOKEN__` inyectado por el servidor y lo envía como cabecera en todas las peticiones; no hay campo para pegarlo ni se guarda en `localStorage`. `RunHeader` muestra perfil, camino, escalón, instancia, marcador, tiempo transcurrido y estado (`idle`/`running`/`truncated`/`finished`). `ParameterPanel` es un `<form>` con perfil, camino, VUs, duración, VUs máximos e instancias, y chips `configured`/`missing` para los tres secretos; botones "Ejecutar" y "Detener". `FlowDiagram` es un SVG con los nodos PC → k6 → `edge`/`origin` → backend → recolector VPS → `reports/` → panel y resalta el nodo activo según `RunState`. Sin pestañas que escondan lo que se vino a mirar.

- [ ] **Step 6: verificar build y guardarraíles**

Run: `pnpm --filter @radio/load-room build && pnpm design:review`
Expected: build sin errores; `design:review` sin hallazgos nuevos en las líneas agregadas.

- [ ] **Step 7: commit**

```bash
git add apps/load-room
git commit -m "feat(load-ui): add live run shell, parameter panel and flow diagram"
```

### Task 4: Graficas en vivo

**Files:**
- Create: `apps/load-room/src/charts/TimelineChart.tsx`, `LatencyChart.tsx`, `ErrorThrottleChart.tsx`, `VpsChart.tsx`, `src/charts/format.ts`
- Test: `apps/load-room/src/charts/format.test.ts`

**Interfaces:**
- Consumes: `SeriesBucket[]` y `VpsBucket[]` de la Tarea 1; eventos de la Tarea 3.
- Produces: componentes con props `{ buckets: SeriesBucket[] }` o `{ rows: VpsBucket[] }`; `formatDuration(ms: number): string`, `formatRate(value: number): string`.

- [ ] **Step 1: escribir la prueba que falla para el formato**

```ts
it("formats durations and rates for a compact dashboard", () => {
  expect(formatDuration(1234)).toBe("1.23 s");
  expect(formatRate(12.345)).toBe("12.3/s");
});
```

- [ ] **Step 2: ejecutar la prueba y verla fallar**

Run: `pnpm --filter @radio/load-room test src/charts`
Expected: FAIL porque los formateadores no existen.

- [ ] **Step 3: implementar los formateadores y las cuatro gráficas**

`TimelineChart`: área de RPS más línea de VUs por escalón. `LatencyChart`: p50/p95/p99 con una `ReferenceLine` en 1500 ms y otra en 2000 ms. `ErrorThrottleChart`: áreas apiladas de `errorRate` y `throttledRate`, con leyenda que diga "backend" y "nginx limit_req". `VpsChart`: CPU y memoria disponible en un eje, red en otro, y marcadores verticales cuando `restarts` aumenta. Todas usan Recharts y los tokens de color del tema local; ninguna recibe mezcla de caminos.

- [ ] **Step 4: ejecutar la prueba y verla pasar**

Run: `pnpm --filter @radio/load-room test src/charts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add apps/load-room/src/charts
git commit -m "feat(load-ui): add live latency, throughput, error and VPS charts"
```

### Task 5: Analisis posterior y comparacion de caminos

**Files:**
- Create: `apps/load-room/src/charts/EndpointHeatmap.tsx`, `CapacityCurve.tsx`, `PathComparison.tsx`, `CorrelationPanel.tsx`, `apps/load-room/src/lib/correlation.ts`
- Test: `apps/load-room/src/lib/correlation.test.ts`

**Interfaces:**
- Consumes: `GET /api/correlate` de la Tarea 2, que devuelve `rows: Array<CorrelatedRow & { path }>` y `saturation: { minute, reason } | null`.
- Produces: `type CorrelatedRowWithPath = CorrelatedRow & { path: "edge" | "origin" }`, `buildPathComparison(rows: CorrelatedRowWithPath[]): { edge: CorrelatedRowWithPath[], origin: CorrelatedRowWithPath[] }`, `findPeakRps(rows: CorrelatedRowWithPath[]): number`, `<EndpointHeatmap buckets={...} />`, `<CapacityCurve rows={...} saturation={{ minute, reason } | null} />`, `<PathComparison rows={...} />`, `<CorrelationPanel />`.

- [ ] **Step 1: escribir la prueba que falla para la comparacion**

```ts
it("keeps edge and origin as two separate curves", () => {
  const rows = [
    { minute: 0, path: "edge", rps: 10, p95Ms: 900 },
    { minute: 0, path: "origin", rps: 30, p95Ms: 200 },
  ] as CorrelatedRowWithPath[];
  const comparison = buildPathComparison(rows);
  expect(comparison.edge).toHaveLength(1);
  expect(comparison.origin).toHaveLength(1);
  expect(findPeakRps(rows)).toBe(30);
});
```

- [ ] **Step 2: ejecutar la prueba y verla fallar**

Run: `pnpm --filter @radio/load-room test src/lib/correlation.test.ts`
Expected: FAIL porque `buildPathComparison` no existe.

- [ ] **Step 3: implementar la separacion y los componentes**

`CorrelatedRow.path` se deriva del nombre del JSON (`-edge-` u `-origin-`) en el servidor. `buildPathComparison` nunca interpola ni promedia valores de caminos distintos. `EndpointHeatmap` es una cuadrícula con p95, errores, peticiones y etiqueta `cold`/`warm` por endpoint, no un gráfico circular. `CapacityCurve` dibuja RPS frente al objetivo de VUs por escalón y resalta el `saturation` que `/api/correlate` calculó con `findSaturation`; no vuelve a implementar el criterio en la UI. `PathComparison` presenta dos curvas pequeñas una al lado de otra. `CorrelationPanel` permite elegir JSON y CSV, llama a `/api/correlate` y muestra la tabla resultante.

- [ ] **Step 4: ejecutar la prueba y verla pasar**

Run: `pnpm --filter @radio/load-room test src/lib/correlation.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add apps/load-room/src/lib/correlation.ts apps/load-room/src/lib/correlation.test.ts apps/load-room/src/charts
git commit -m "feat(load-ui): add endpoint heatmap, capacity curve and path comparison"
```

### Task 6: Arranque, documentacion y verificacion de extremo a extremo

**Files:**
- Modify: `package.json` (scripts `load:ui`, `load:ui:test`), `scripts/loadtest/README.md`, `docs/runbooks/load-testing.md`, `docs/reference/commands.md`
- Test: `scripts/loadtest/tests/control-room-e2e.test.mjs`
- Create: `scripts/loadtest/control-room/test-server.mjs`

**Interfaces:**
- Consumes: todos los componentes y el servidor de las tareas anteriores; el stub `k6.exe` ya usado para probar el interruptor en la Tarea 1 del plan original.
- Produces: `startTestServer(): Promise<{ url: string, token: string, close(): Promise<void> }>`, `pnpm load:ui` que construye la app, arranca el servidor e imprime la URL y el token; documentación que explica cómo abrirlo y qué significa cada gráfica.

- [ ] **Step 1: escribir la prueba que falla para el arranque**

```ts
it("exposes state and a token-protected run endpoint", async () => {
  const { url, token, close } = await startTestServer();
  const response = await fetch(`${url}/api/state`);
  expect(response.status).toBe(401);
  const authorized = await fetch(`${url}/api/state`, { headers: { "x-load-room-token": token } });
  expect(authorized.status).toBe(200);
  await close();
});
```

- [ ] **Step 2: ejecutar la prueba y verla fallar**

Run: `node --test scripts/loadtest/tests/control-room-e2e.test.mjs`
Expected: FAIL porque el servidor no responde en el puerto de prueba.

- [ ] **Step 3: implementar los scripts y la documentacion**

`load:ui` compila `apps/load-room` y ejecuta `node scripts/loadtest/control-room/server.mjs`. La prueba de extremo a extremo arranca el servidor en un puerto efímero con un `k6.exe` stub en `PATH`, comprueba el 401 sin token, el 200 con token, que `POST /api/run` devuelve un marcador y que el SSE emite al menos un evento `state` y uno `points`. La documentación explica que la UI no sustituye al runbook, que los secretos no se guardan y que una corrida detenida se marca como truncada.

- [ ] **Step 4: ejecutar la prueba y verla pasar**

Run: `node --test scripts/loadtest/tests/control-room-e2e.test.mjs && pnpm --filter @radio/load-room build`
Expected: PASS y build sin errores.

- [ ] **Step 5: commit**

```bash
git add package.json scripts/loadtest apps/load-room docs
git commit -m "feat(load-ui): wire local dashboard startup and document it"
```
