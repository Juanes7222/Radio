# Pruebas de carga con k6 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** proporcionar un arnés modular con k6 para medir la capacidad máxima de la emisora y correlacionar la degradación con CPU, memoria, ancho de banda y latencia de la VPS de producción.

**Architecture:** los scripts de k6 se organizan por superficie en `scripts/loadtest/scenarios/` y comparten utilidades en `lib/`; un orquestador `run.mjs` invocado por `pnpm` lanza perfiles, controla la parada y exporta resultados. Cada perfil se ejecuta en dos caminos etiquetados —`edge` a través de nginx y `origin` directo al backend de la VPS— y se correlaciona con un recolector de métricas que corre en la VPS.

**Tech Stack:** Grafana k6 OSS instalado como binario en Windows, Node 20+ para el orquestador, pnpm, Express/Prisma, nginx, PM2, `sysstat` en la VPS, PowerShell como shell del operador.

**Spec:** `docs/superpowers/specs/2026-11-26-k6-load-testing-design.md`

## Global Constraints

- El generador es la PC del usuario con Windows nativo: Ryzen 5 7600X, 32 GB de RAM, 900 Mb simétricos, k6 como binario instalado con `winget install k6`, sin WSL. La GPU no se usa. `k6 version` es prerrequisito del runbook; `pnpm exec k6` no funciona porque k6 no es una dependencia npm.
- Los scripts de k6 son `.js` con `// @ts-check` y JSDoc; `tsconfig.json` con `checkJs: true` en `scripts/loadtest/`. k6 no ejecuta TypeScript directamente.
- Ejecutar solo en ventana de mantenimiento. El sistema puede caer; se acepta por diseño. El stream en vivo y los SSE quedan fuera de carga.
- Cada resultado debe nombrar el camino medido: `edge` (`https://lavozverdad.com`, con nginx) u `origin` (`http://<IP_PUBLICA_DE_LA_VPS>:<PUERTO_REAL>`). El puerto se confirma en la VPS con `ss -lntp | grep node`; nginx usa 3000, pero `PORT` es 3001 por defecto en el código. `127.0.0.1:3000` en la PC apuntaría a la propia PC y no mide nada. `origin` evita nginx pero sí incluye el RTT de internet, medido por separado. Ninguna conclusión mezcla ambos.
- El camino `origin` requiere una regla temporal de firewall en la VPS que permita el puerto real solo desde la IP pública de la PC; se verifica con `curl.exe http://<IP>:<PUERTO>/health` antes de medir y se retira al terminar. No se usa túnel SSH porque añadiría un salto y falsearía la latencia.
- nginx limita `/api/` a 10 r/s con `burst=60 nodelay`, `/live-status/` a 40 conexiones, `/listen/la_voz_de_la_verdad/` a 60, `/admin-api/auth/google` a 30 intentos / 10 min por IP, `/admin-api/` y `/panel-api/` a 30 r/m (`zone=general`), y `/api/telemetry` a 20 escrituras / min por dispositivo.
- Cachés en memoria del backend: `/api/nowplaying` 5 s, `/api/schedule` 60 s, `/api/schedule/categories` 60 s con clave fija `__all__`, `/api/search` 10 min. La clave de caché depende de `x-forwarded-host`/`host` y `x-forwarded-proto`, no de `X-Forwarded-For`.
- PM2 corre una sola instancia llamada `radio-backend`, con `max_memory_restart: 300M`. El campo de reinicios es `restarts`, no `restart_count`.
- `PRAYER_EMAIL_RECIPIENTS` se lee de Infisical al arrancar: vaciarlo exige editar la VPS y ejecutar `pm2 restart radio-backend`, lo que reinicia `restarts`; hacerlo antes de abrir la ventana y registrarlo. Asignar la variable en PowerShell no afecta al proceso remoto. Si no puede vaciarse, el perfil de escrituras no se ejecuta.
- Timeouts de AzuraCast que afectan la latencia: 15 s API, 300 s subidas, 10 s cortas. `/admin-api/nowplaying` y `/api/search` son proxies sin caché o con caché fría costosa: se miden de forma aislada, no en tráfico sostenido.
- Secretos solo por entorno del proceso. El JWT de admin se genera dentro de la VPS con el `JWT_SECRET` de su entorno y solo el token resultante se exporta a la PC como `K6_ADMIN_TOKEN`. `JWT_SECRET`, `WORKER_AUTH_SECRET` y `PANEL_SECRET` nunca se copian a la PC ni se versionan.
- Umbrales iniciales, a recalibrar tras la primera referencia: `p(95) < 800 ms` en `origin`, `p(95) < 1500 ms` en `edge`, `http_req_failed < 0.01`, `http_req_failed{throttled:no} < 0.01` en `edge`, `checks: ['rate > 0.99']`.
- Los `429` del `limit_req` se etiquetan `throttled: "yes"` y se excluyen del umbral de fallos; se reportan como limitación de nginx, nunca como error del backend. La medición del limitador es un perfil separado con su propio criterio de éxito.
- Los perfiles `public-reads`, `admin-reads`, `worker-reads` y `public-writes` se ejecutan en ambos caminos cuando aplique; `capacity` se mide en `origin` y se repite en `edge` solo para comparar la curva con limitador.
- Rutas y contratos se verifican contra el código, no solo contra `docs/reference/api-surface.md`: ese documento está desactualizado en `start`/`end` de `/api/schedule`, `translation` de `/api/bible/books`, el permiso de `/admin-api/nowplaying` y la ruta del listado admin de opiniones. Se corrige en la Tarea 7.

## Review Focus

- Camino `origin` mal resuelto: apuntar a `127.0.0.1:3000` de la PC o usar un túnel SSH mide la máquina del operador o añade un salto, respectivamente. Se fija en la Tarea 1 con validación de IP pública, puerto confirmado y regla de firewall, y en la Tarea 6 con el RTT medido por separado.
- 429 contados como fallo: con 20 VUs, `edge` supera los 10 r/s de nginx; sin etiquetarlos, k6 termina con código 1 y el operador culpa al backend. Se fija en la Tarea 1 con la sub-métrica `http_req_failed{throttled:no}` y en la Tarea 2 con la separación de muestras.
- Caché mal etiquetada: `schedule/categories` usa una clave global y `X-Forwarded-For` no interviene en ninguna clave; etiquetar `cold` por VU inventa una diferencia. Se fija en la Tarea 2 con ráfagas dentro del TTL, `Host`/`X-Forwarded-Host` para la clave y exclusión de `categories`.
- Escrituras con payload equivocado y rastro: prayer exige `name`/`request`, feedback exige `SUGERENCIA`, prayer crea un `Device` y emite SSE, y los correos se envían si la variable remota sigue definida. Se fija en la Tarea 3 con campos reales, marcador del orquestador, limpieza de tres tablas y verificación de correos.
- JWT con claims erróneos: `requireAuth` exige `sub` y compara `tv` contra `tokenVersion` de la base, recargando permisos desde la fila. Se fija en la Tarea 4 con el token generado en la VPS y verificación de 401 frente a 403.

---

### Task 1: Arnés base, configuración y smoke

**Files:**
- Create: `scripts/loadtest/config.js`
- Create: `scripts/loadtest/lib/http.js`
- Create: `scripts/loadtest/lib/thresholds.js`
- Create: `scripts/loadtest/lib/summary.js`
- Create: `scripts/loadtest/scenarios/smoke.js`
- Create: `scripts/loadtest/run.mjs`
- Create: `scripts/loadtest/tsconfig.json`
- Modify: `package.json` (añadir los scripts `load:*`)

**Interfaces:**
- Consumes: variables de entorno `K6_BASE_URL`, `K6_ORIGIN_URL`, `K6_ADMIN_TOKEN`, `K6_WORKER_SECRET`, `K6_PANEL_SECRET`, `K6_MARKER`.
- Produces: `loadConfig()` que valida solo la URL del camino elegido y devuelve `{ baseUrl, originUrl, path }` con `path` ∈ `"edge" | "origin"`; `requestWithTags(url, params, tags)`; `DEFAULT_THRESHOLDS`; `summarize(data)`; `run.mjs <profile> [--path edge|origin] [--vus N] [--duration T] [--instances N]`.

- [ ] **Step 1: crear la configuración fail-fast por camino**

Escribir `scripts/loadtest/config.js` con `export function loadConfig()` que lee `K6_PATH` (por defecto `"edge"`, rechaza otros valores) y valida únicamente la URL de ese camino: `K6_BASE_URL` si es `edge`, `K6_ORIGIN_URL` si es `origin`. Exige que empiece por `http://` o `https://`, rechaza `localhost` y `127.0.0.1` en `originUrl`, y lanza un error con el nombre de la variable ausente o inválida. Incluir un comentario en inglés que explique que `origin` necesita una regla de firewall temporal en la VPS. Con solo `K6_ORIGIN_URL` definida, `loadConfig()` debe funcionar en modo `origin`.

- [ ] **Step 2: escribir la prueba que falla antes de existir el arnés**

Crear `scripts/loadtest/scenarios/smoke.js` con un `check` sobre `GET {url}/health` que exige `status === 200` y un cuerpo con `status` o `ok`, y los umbrales de `DEFAULT_THRESHOLDS`. Sin `config.js` importado aún, ejecutar:

```powershell
k6 run scripts/loadtest/scenarios/smoke.js
```

Expected: la ejecución falla por `Cannot find module './config.js'` o por URL indefinida. Esto prueba que el arnés todavía no existe.

- [ ] **Step 3: implementar el helper HTTP y el resumen**

`lib/http.js` exporta `requestWithTags(url, params, tags)` que llama a `http.get`, fusiona `tags` en `params.tags`, añade `throttled: "yes"` cuando el status es 429 y devuelve la respuesta sin leer el cuerpo. `lib/thresholds.js` exporta `DEFAULT_THRESHOLDS` con `http_req_duration: ['p(95) < 1500']`, `http_req_failed: ['rate < 0.01']`, `http_req_failed{throttled:no}: ['rate < 0.01']` y `checks: ['rate > 0.99']`. `lib/summary.js` exporta `summarize(data)` que imprime por `console.log` un JSON con `path`, `vus`, `http_reqs`, `http_req_duration.p95`, `http_req_failed`, `throttledRequests` y `checks`.

- [ ] **Step 4: conectar el smoke y verificar que pasa**

Importar `loadConfig()` y `requestWithTags()` en `smoke.js`, usar `options.thresholds = DEFAULT_THRESHOLDS` y `export function handleSummary(data) { return { stdout: summarize(data) }; }`. Con el puerto real confirmado en la VPS, ejecutar:

```powershell
$env:K6_PATH="origin"; $env:K6_ORIGIN_URL="http://<IP_PUBLICA_DE_LA_VPS>:<PUERTO_REAL>"; k6 run scripts/loadtest/scenarios/smoke.js
```

Expected: `checks` en 100 %, `http_req_failed` por debajo del umbral, salida de k6 con código 0.

- [ ] **Step 5: crear el orquestador y los scripts pnpm**

`run.mjs` acepta `smoke|public-reads|public-writes|admin-reads|worker-reads|capacity|capacity-mixed|search-isolated`, resuelve `scripts/loadtest/scenarios/<profile>.js`, crea `reports/` con `fs.mkdirSync(..., { recursive: true })`, genera `K6_MARKER` con `Date.now()` y lo imprime en stdout, y lanza `k6 run` como proceso hijo heredando `stdio` con `--out json=reports/<profile>-<path>-i<id>-<timestamp>.json`. El flag `--path` prevalece sobre `K6_PATH`, `--instances N` lanza N procesos con `K6_INSTANCE_ID=1..N` y `K6_VUS_MAX` como única fuente de VUs, y un archivo `scripts/loadtest/.stop` provoca la terminación. Añadir a `package.json`: `load:smoke`, `load:reads`, `load:writes`, `load:admin`, `load:workers`, `load:capacity`, `load:capacity:mixed`, `load:search`, todos delegando en `node scripts/loadtest/run.mjs <perfil>`.

- [ ] **Step 6: verificar el interruptor de parada y documentar su salida**

Ejecutar `pnpm load:smoke --duration 60s`, crear `scripts/loadtest/.stop` a los 2 s desde otra terminal, y comprobar que el proceso termina antes de los 60 s, que no queda archivo `.stop` y que `reports/` contiene un JSON con eventos de tipo `Point`. En Windows `child.kill()` no entrega una señal limpia a k6: documentar en `scripts/loadtest/README.md` que una corrida detenida por `.stop` es "truncada", que `handleSummary()` puede no ejecutarse y que la evidencia válida es el JSON incremental, no el resumen de stdout.

- [ ] **Step 7: commit**

```powershell
git add scripts/loadtest package.json
git commit -m "test(load): add k6 harness, smoke scenario and stop switch"
```

### Task 2: Perfil de lectura pública, en ambos caminos

**Files:**
- Create: `scripts/loadtest/lib/endpoints.js`
- Create: `scripts/loadtest/scenarios/public-reads.js`
- Create: `scripts/loadtest/scenarios/search-isolated.js`
- Modify: `scripts/loadtest/run.mjs` (aceptar `--path edge|origin`)

**Interfaces:**
- Consumes: `loadConfig()`, `requestWithTags()`, `DEFAULT_THRESHOLDS`, `summarize()` de la Tarea 1.
- Produces: `PUBLIC_ENDPOINTS` con ocho rutas de lectura barata; `public-reads.js` etiqueta cada petición con `path`, `endpoint`, `cache` y `throttled`; `search-isolated.js` mide el coste de `/api/search` con caché caliente.

- [ ] **Step 1: fijar el inventario de rutas baratas**

`lib/endpoints.js` exporta `PUBLIC_ENDPOINTS` con: `/api/nowplaying`, `/api/schedule?start=<fijo>&end=<fijo>`, `/api/bible/reading/today`, `/api/bible/translations`, `/api/bible/books?translation=RVR1960`, `/api/health/public`, `/health`, y `/api/bible/search?q=<fijo>`. Cada entrada lleva `{ name, path, expectedStatus }`. Fijar `start`, `end` y `translation` para que la clave de caché sea estable. Excluir `/api/schedule/categories` (clave global `__all__`, sin distinción frío/caliente), `/api/search` (coste alto, perfil propio), `/station/:stationId/art/:artId` (hasta 45 s) y `/live-status/` (límite de 40 conexiones).

- [ ] **Step 2: escribir la comprobación de caché frío/caliente con TTL real**

En `public-reads.js`, variar `Host` y `X-Forwarded-Host` por VU con al menos 20 valores **solo en el camino `origin`**, porque la clave de caché se construye con esos headers. `X-Forwarded-For` se envía con una IP única por VU para simular clientes ante el rate limit, pero se documenta que no afecta a la caché. La etiqueta `cache` se asigna por ráfagas cortas dentro del TTL —menos de 5 s para `/api/nowplaying` y menos de 60 s para `/api/schedule`— y no por "primera petición del VU". En `edge`, las respuestas 429 se aceptan en cualquier endpoint y se etiquetan `throttled: "yes"` mediante `requestWithTags`.

- [ ] **Step 3: ejecutar el perfil en ambos caminos y guardar la comparación**

```powershell
pnpm load:reads --path edge --vus 20 --duration 2m
pnpm load:reads --path origin --vus 20 --duration 2m
```

Expected: dos JSON en `reports/`. En `origin`, la comparación debe mostrar p95 distinto entre ráfagas `cold` y `warm` para `/api/nowplaying` dentro de los 5 s; si no aparece, revisar los headers antes de culpar a la caché. En `edge`, los 429 deben quedar fuera de `http_req_failed{throttled:no}`.

- [ ] **Step 4: medir `/api/search` de forma aislada**

`search-isolated.js` hace una primera llamada para calentar la caché de 10 min, espera a que termine, y solo entonces mide 20 VUs durante 1 min con una sola clave de `Host`. Ejecutar en `origin`. Expected: la primera llamada se reporta por separado con su latencia real contra AzuraCast; las siguientes no superan el umbral de caché caliente. El reporte debe decir explícitamente que este número no se mezcla con la lectura barata.

- [ ] **Step 5: verificar que el limitador de nginx se ve solo en `edge`**

Comprobar que `edge` registra 429 etiquetados y `origin` no. Si `origin` también registra 429, revisar que no haya un proxy interception y corregir antes de continuar. El reporte debe separar "fallos del backend" de "limitación de nginx".

- [ ] **Step 6: commit**

```powershell
git add scripts/loadtest
git commit -m "test(load): add public read profile with edge/origin comparison"
```

### Task 3: Perfil de escrituras públicas con guardas y limpieza

**Files:**
- Create: `scripts/loadtest/scenarios/public-writes.js`
- Create: `scripts/loadtest/lib/cleanup.mjs`
- Modify: `scripts/loadtest/run.mjs` (rechazar el perfil si faltan guardas)

**Interfaces:**
- Consumes: `loadConfig()`, `requestWithTags()`, `DEFAULT_THRESHOLDS`, `K6_MARKER` del orquestador.
- Produces: `buildWritePayload(marker)` con los contratos reales de prayer y feedback; `cleanup.mjs <marker>` que imprime las sentencias SQL para borrar `prayer_requests`, `feedback_messages` y `devices`.

- [ ] **Step 1: implementar la guarda de escritura**

`run.mjs` lanza el perfil `public-writes` solo si `process.env.K6_ALLOW_WRITES === "1"`; si no, imprime la razón y sale con código 2 sin invocar k6. Además comprueba, mediante una consulta a la VPS, que `PRAYER_EMAIL_RECIPIENTS` está vacío en el entorno efectivo de `radio-backend`; si no, sale con código 3 y explica que hay que vaciarlo en Infisical y ejecutar `pm2 restart radio-backend` antes de abrir la ventana. Verificar:

```powershell
pnpm load:writes
```

Expected: código 2 y ningún JSON nuevo en `reports/`.

- [ ] **Step 2: generar payloads válidos y marcados**

`buildWritePayload(marker)` produce para `POST /api/prayer`: `{ name: "K6 <marker>", request: "Prueba de carga <marker> para medir capacidad", deviceId: "k6-<marker>" }`, con `request` de al menos 10 caracteres. Para `POST /api/feedback`: `{ categoria: "SUGERENCIA", mensaje: "Prueba de carga <marker>", consent: true }`, tomando la categoría de `FEEDBACK_CATEGORIES` en `@radio/types` en lugar de escribir el literal. El `marker` viene de `K6_MARKER`, generado por `run.mjs` y heredado por el hijo; se imprime en el stdout del orquestador y se exige como argumento de `cleanup.mjs`. Los `check` exigen `status === 201`. El caso negativo omite `request` en prayer y exige `400` con "La peticion es obligatoria". Documentar que cada prayer hace `upsert` de `Device` y emite `broadcastPrayerCreated` por SSE: ambos cuentan como carga y como rastro a limpiar, y los paneles abiertos recibirán peticiones falsas durante la ventana.

- [ ] **Step 3: ejecutar en ambos caminos con volumen moderado**

```powershell
$env:K6_ALLOW_WRITES="1"; pnpm load:writes --path edge --vus 5 --duration 1m
$env:K6_ALLOW_WRITES="1"; pnpm load:writes --path origin --vus 5 --duration 1m
```

Expected: `checks` en 100 %, y consultas sobre la VPS confirman filas nuevas en `prayer_requests` (columna `request`), `feedback_messages` (columna `mensaje`) y `devices` (`deviceId` `k6-<marker>`), todas con el marcador impreso.

- [ ] **Step 4: demostrar que no se enviaron correos**

Revisar `/var/log/pm2/radio-backend-error.log` durante la ventana buscando entradas nuevas de "Failed to send prayer email". Expected: cero líneas nuevas; si aparecen, detener la prueba y corregir la configuración antes de continuar.

- [ ] **Step 5: limpiar y verificar que no queda rastro**

`cleanup.mjs <marker>` imprime tres sentencias SQL con el marcador escapado, a ejecutar en una sola transacción con `sqlite3 /var/www/radio/backend/prisma/dev.db`: `DELETE FROM prayer_requests WHERE request LIKE '%<marker>%';`, `DELETE FROM feedback_messages WHERE mensaje LIKE '%<marker>%';` y `DELETE FROM devices WHERE deviceId LIKE 'k6-<marker>%';`. Repetir las consultas. Expected: cero filas con el marcador en las tres tablas; el runbook debe registrar la ruta real de la base de datos.

- [ ] **Step 6: commit**

```powershell
git add scripts/loadtest
git commit -m "test(load): add guarded public write profile and cleanup"
```

### Task 4: Perfil de panel y protocolo de workers

**Files:**
- Create: `scripts/loadtest/lib/auth.js`
- Create: `scripts/loadtest/scenarios/admin-reads.js`
- Create: `scripts/loadtest/scenarios/worker-reads.js`
- Modify: `scripts/loadtest/run.mjs` (validar secretos requeridos por perfil)

**Interfaces:**
- Consumes: `loadConfig()`, `requestWithTags()`, `DEFAULT_THRESHOLDS`, `K6_ADMIN_TOKEN`, `K6_WORKER_SECRET`, `K6_PANEL_SECRET`.
- Produces: `makeAdminHeaders()` con `Authorization: Bearer <K6_ADMIN_TOKEN>`; `makeWorkerHeaders()` con `x-worker-secret`; `makePanelHeaders()` con `x-panel-secret`.

- [ ] **Step 1: generar el JWT dentro de la VPS y usarlo sin copiar secretos**

Ejecutar en la VPS un `node -e` que lea `JWT_SECRET` del entorno de `radio-backend`, tome un `AdminUser` activo con permisos `dashboard`, `feedback` y `youtube`, y firme un token con `sub` = id del usuario y `tv` = su `tokenVersion` (el claim es `tv`, no `tokenVersion`). Exportar solo el JWT resultante a la PC como `K6_ADMIN_TOKEN`. `lib/auth.js` usa ese valor directamente; nunca lee `JWT_SECRET`. `requireAuth` ignora los permisos del token y los recarga de la base en cada request. Verificar que `GET /admin-api/auth/me` responde 200; un 401 indica `sub`/`tv` equivocados y un 403 indica permisos insuficientes en la fila. Documentar en el runbook qué cuenta se usó y por qué.

- [ ] **Step 2: perfilar lecturas del panel sin golpear AzuraCast de forma sostenida**

`admin-reads.js` recorre `/admin-api/playback/filters`, `/admin-api/feedback` y `/admin-api/health/watchdog` con `check` de 200, `sleep(2)` para mantenerse por debajo de los 30 r/m de la zona `general`, y latencia etiquetada por endpoint. `/admin-api/nowplaying` se mide como llamada aislada en `search-isolated.js` o en un step aparte, porque es un proxy directo sin caché a AzuraCast. Ejecutar el perfil con 10 VUs durante 2 min en `edge` y repetir en `origin`, marcando los 429 de `edge` con `throttled:yes`. Expected: cero 401, cero 403 y cero llamadas a `/admin-api/auth/google`.

- [ ] **Step 3: perfilar el protocolo de workers sin efectos secundarios**

`worker-reads.js` usa `x-worker-secret` sobre `GET /workers/updates/latest` y `x-panel-secret` sobre `GET /panel-api/status`, con `check` de 200 o 204 y `sleep(2)`. Ejecutar en `origin` y, en `edge`, solo por debajo de 0,5 r/s tratando el 429 como resultado esperado de la zona `general`. No incluir `/admin-api/workers/upload`, `/admin-api/worker-releases` ni el webhook de YouTube. Antes y después, consultar `GET /admin-api/workers/jobs` con el JWT de admin (no con `x-worker-secret`) y comparar solo los jobs con `createdAt` dentro de la ventana: el cron de YouTube crea jobs a las `:07`, `:22`, `:37` y `:52` por su cuenta. Expected: cero jobs nuevos atribuibles al perfil.

- [ ] **Step 4: commit**

```powershell
git add scripts/loadtest
git commit -m "test(load): add admin and worker read profiles with static secrets"
```

### Task 5: Recolección de métricas del VPS y correlación

**Files:**
- Create: `scripts/loadtest/monitor/collect.sh`
- Create: `scripts/loadtest/monitor/correlate.mjs`
- Create: `scripts/loadtest/monitor/README.md`

**Interfaces:**
- Consumes: uno o más JSON de `--out json` de k6 y el CSV del recolector.
- Produces: `collect.sh <pid> <seconds> <output.csv>`; `correlate.mjs <k6.json> [k6-2.json ...] <metrics.csv> <report.md>`.

- [ ] **Step 1: escribir el recolector a 1 Hz**

`collect.sh` muestrea cada segundo durante `<seconds>`: timestamp Unix, `%CPU` y RSS del PID con `ps`, memoria disponible y total con `free`, bytes de red calculando el delta de `/proc/net/dev` entre lecturas (no con `sar -n DEV 1` dentro del bucle, porque bloquea y duplica el intervalo), y `restarts` con `pm2 jlist` filtrando el proceso `radio-backend`. Escribe cabecera CSV y una fila por segundo; no instala nada por su cuenta.

- [ ] **Step 2: documentar prerrequisitos en la VPS**

`monitor/README.md` indica cómo obtener el PID con `pm2 pid radio-backend`, el comando exacto de arranque en background y cómo detenerlo. Define `%CPU` como porcentaje sobre el total de núcleos y memoria disponible como `available/total` de `free`. Incluye la advertencia de que el muestreo corre en la misma VPS y consume una fracción pequeña de CPU, por lo que su coste se reporta.

- [ ] **Step 3: correlacionar recortando a la ventana exacta**

`correlate.mjs` lee los puntos `Point` de todos los JSON, recorta el CSV a los timestamps comprendidos entre el primero y el último punto, agrupa por minuto y calcula p95, tasa de error y RPS sumando las muestras de todas las instancias; lee el CSV y calcula CPU, memoria, red y reinicios por minuto; escribe una tabla markdown con ambas mitades. Probar con una ejecución de 2 min del perfil `public-reads` en `origin`. Expected: el mismo número de minutos en ambas mitades y la columna de `restarts` en cero, o el evento si ocurrió.

- [ ] **Step 4: commit**

```powershell
git add scripts/loadtest/monitor
git commit -m "test(load): add VPS metric collector and k6 correlation report"
```

### Task 6: Prueba de capacidad por escalones y criterio de saturación

**Files:**
- Create: `scripts/loadtest/scenarios/capacity.js`
- Create: `scripts/loadtest/scenarios/capacity-mixed.js`
- Create: `scripts/loadtest/lib/stages.js`
- Modify: `scripts/loadtest/run.mjs` (perfil `capacity` con dos instancias opcionales)

**Interfaces:**
- Consumes: `loadConfig()`, `requestWithTags()`, `DEFAULT_THRESHOLDS`, `summarize()`, `PUBLIC_ENDPOINTS`, `collect.sh`, `makeAdminHeaders()`, `makeWorkerHeaders()`.
- Produces: `buildStages(profile)` con los escalones; `capacity.js` y `capacity-mixed.js` con `executor: "ramping-vus"` y etiqueta `stage`.

- [ ] **Step 1: definir los escalones con una sola fuente de VUs**

`buildStages("standard")` devuelve `[{ duration: "30s", target: 10 }, { duration: "2m", target: 25 }, { duration: "2m", target: 50 }, { duration: "2m", target: 100 }, { duration: "2m", target: 200 }, { duration: "2m", target: 400 }, { duration: "2m", target: 800 }, { duration: "30s", target: 0 }]`. `buildStages("max")` dobla los objetivos y se activa solo con `K6_VUS_MAX > 800`. `gracefulRampDown: "10s"`. El orquestador es la única fuente de VUs: `--vus-max` decide entre `standard` y `max`; `--instances N` divide los objetivos entre N procesos.

- [ ] **Step 2: escribir el perfil con etiqueta de escalón y umbrales por endpoint**

`capacity.js` usa `executor: "ramping-vus"`, `startVUs: 0`, `stages: buildStages(...)`, `discardResponseBodies: true` y `sleep(0.5)`. Importar `tagWithCurrentStageIndex()` de `https://jslib.k6.io/k6-utils/1.3.0/index.js` y llamarlo en cada petición para etiquetar `stage`; `exec.scenario.iterationInTest` no identifica el escalón. En `lib/thresholds.js` generar una clave explícita por cada endpoint del inventario, por ejemplo `'http_req_duration{endpoint:/api/nowplaying}': ['p(95)<2000']`; k6 no admite comodines. Añadir `p(95) < 2000` y `http_req_failed < 0.05` globales.

- [ ] **Step 3: definir el perfil mixto**

`capacity-mixed.js` reutiliza `buildStages()` y divide las iteraciones con pesos 80 % `PUBLIC_ENDPOINTS`, 15 % lecturas del panel (`/admin-api/playback/filters`, `/admin-api/feedback`) y 5 % lectura de workers (`/workers/updates/latest`), con los headers de la Tarea 4 y etiqueta `surface: public|admin|worker`. Sin escrituras, para no contaminar la capacidad con INSERTs; las escrituras se miden en la Tarea 3. Expected: el reporte distingue "lectura pública pura" de "mezcla representativa".

- [ ] **Step 4: ejecutar la prueba de capacidad con recolector activo**

En la VPS iniciar `bash collect.sh <pid> 900 reports/capacity.csv`; desde la PC ejecutar `pnpm load:capacity --vus-max 800` y `pnpm load:capacity:mixed --vus-max 800`, ambos con `K6_PATH=origin`. Al terminar, detener el recolector y ejecutar `node scripts/loadtest/monitor/correlate.mjs reports/capacity-origin.json reports/capacity-mixed-origin.json reports/capacity.csv reports/capacity.md`. Expected: `capacity.md` contiene la tabla por escalón, el pico de RPS y el primer escalón donde se cumple cualquiera de: p95 > 2000 ms, errores > 5 %, CPU > 85 % del total de núcleos sostenido 2 min, memoria disponible < 10 %, RPS sin crecer al subir VUs, o `restarts` mayor que la línea base.

- [ ] **Step 5: verificar si saturó el generador en lugar del servidor**

Añadir al reporte `dropped_iterations`, `iteration_duration` y el uso de CPU de la PC durante la prueba. Si hay iteraciones descartadas o la PC supera el 90 % de CPU, la conclusión debe ser "saturó el generador" y la muestra se descarta, no "saturó la emisora".

- [ ] **Step 6: verificar la saturación con dos instancias si hace falta**

Si la curva de RPS sigue creciendo a 800 VUs en `origin`, repetir con `K6_VUS_MAX=1600` y `--instances 2`. Cada JSON incluye el id de instancia en el nombre y todas las métricas llevan `instance: 1|2`; `correlate.mjs` suma los RPS por minuto y calcula p95 sobre la unión de muestras. Expected: el servidor, no la PC, es el primer recurso agotado.

- [ ] **Step 7: medir el RTT y anotarlo en el reporte**

Antes de la prueba, ejecutar desde la PC `curl.exe -o NUL -s -w "%{time_connect} %{time_starttransfer}\n" https://lavozverdad.com/api/nowplaying` diez veces. Añadir la mediana al encabezado de `capacity.md` con la nota de que `edge` incluye ese RTT y `origin` incluye solo el trayecto hasta el puerto directo, sin nginx.

- [ ] **Step 8: commit**

```powershell
git add scripts/loadtest
git commit -m "test(load): add staged capacity profile and saturation criteria"
```

### Task 7: Runbook operativo y documentación del repo

**Files:**
- Create: `docs/runbooks/load-testing.md`
- Modify: `docs/testing.md` (añadir una sección de pruebas de carga y su lugar en la estrategia)
- Modify: `docs/reference/commands.md` (listar los comandos `pnpm load:*`)
- Modify: `docs/reference/api-surface.md` (corregir contratos desactualizados)
- Modify: `scripts/loadtest/README.md` (índice de perfiles y variables)

**Interfaces:**
- Consumes: todos los perfiles, umbrales y el formato de reporte de las tareas anteriores.
- Produces: un procedimiento ejecutable por otra persona sin leer el código.

- [ ] **Step 1: escribir el runbook con la secuencia completa**

`docs/runbooks/load-testing.md` debe contener, en este orden: verificar `k6 version`; anunciar la ventana de mantenimiento; confirmar que no hay streamer al aire; vaciar `PRAYER_EMAIL_RECIPIENTS` en Infisical y ejecutar `pm2 restart radio-backend`, anotando el `restarts` resultante como línea base; confirmar el puerto real con `ss -lntp`; abrir la regla de firewall desde la IP de la PC y verificar con `curl.exe`; medir RTT; iniciar `collect.sh`; ejecutar `smoke`, `reads` en `edge` y `origin`, `search`, `admin`, `workers`, `writes` (si aplica), `capacity` y `capacity:mixed`; detener el recolector; ejecutar `cleanup.mjs` con el `K6_MARKER` impreso; cerrar la regla de firewall; verificar `restarts`; archivar `reports/`; restaurar `PRAYER_EMAIL_RECIPIENTS` y reiniciar; confirmar que la radio volvió al aire.

- [ ] **Step 2: documentar qué NO se carga**

En el mismo runbook, listar explícitamente: `/live-status/`, `/listen/la_voz_de_la_verdad/`, `/admin-api/workers/upload`, `/admin-api/worker-releases`, el webhook de YouTube, `/api/telemetry` sostenido, `/api/search` en tráfico mixto y cualquier endpoint que inicie jobs o cambie el estado de AzuraCast, con la razón de cada exclusión. Avisar de que los paneles abiertos recibirán eventos SSE falsos durante el perfil de escrituras.

- [ ] **Step 3: corregir `docs/reference/api-surface.md`**

Actualizar cuatro contratos: `/api/schedule` defaulta `start`/`end` a una semana; `/api/bible/books` defaulta `translation` a `RVR1960`; `/admin-api/nowplaying` exige solo `requireAuth`, sin permiso `schedule`; el listado admin de opiniones es `GET /admin-api/feedback`, no `GET /api/feedback`. Verificar cada uno contra el código antes de editar.

- [ ] **Step 4: integrar con la documentación existente**

Añadir a `docs/testing.md` una sección "Pruebas de carga" que remita al runbook y aclare que no sustituyen a Vitest ni a los guardarraíles de diseño. Añadir los comandos a `docs/reference/commands.md` con el mismo formato de tabla del archivo.

- [ ] **Step 5: verificar que un tercero pueda seguirlo**

Pedir a un subagente fresco que lea solo `docs/runbooks/load-testing.md` y `scripts/loadtest/README.md` y liste los comandos que ejecutaría en orden. Comparar con la secuencia del Step 1; si falta algún paso, corregir el runbook.

- [ ] **Step 6: commit**

```powershell
git add docs scripts/loadtest/README.md
git commit -m "docs: add load testing runbook and command inventory"
```
