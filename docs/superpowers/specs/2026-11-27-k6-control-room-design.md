# Sala de carga: entorno visual para k6

> Documento de diseño. El plan derivado está en
> `docs/superpowers/plans/2026-11-27-k6-control-room.md`.

**Fecha:** 2026-11-27

## Intención

El operador quiere ver una prueba de carga en pantalla, no interpretar JSON ni
resúmenes de terminal. Necesita tres cosas a la vez: seguir la corrida mientras
ocurre, entender después qué pasó con gráficas claras, y cambiar parámetros sin
editar archivos a mano. El arnés de `scripts/loadtest/` ya produce los datos:
eventos `Point` incrementales de k6, etiquetas por camino/endpoint/escalón y un
CSV del VPS a 1 Hz. Falta presentarlos.

## Objetivos

- Ver en vivo el estado de la corrida: perfil, camino, VUs, escalón, instancia,
  marcador, duración y señal de parada.
- Ver resultados con gráficas que respondan a preguntas concretas: cuándo sube
  la latencia, si un 429 es del limitador o un error del backend, qué endpoint
  sufre, qué recurso de la VPS se agota y en qué escalón.
- Permitir modificar parámetros no secretos desde la interfaz y lanzar o detener
  una corrida sin salir del navegador.
- Comparar `edge` contra `origin` sin mezclar sus curvas en un mismo gráfico.

## No objetivos

- No desplegar el panel en producción ni tocar nginx, PM2 ni el frontend público.
- No instalar Grafana Cloud ni introducir un servicio externo.
- No guardar secretos en disco, navegador ni reportes.
- No sustituir al runbook: la ventana de mantenimiento, el firewall temporal y
  la limpieza siguen siendo obligatorios.
- No cambiar los escenarios de carga ni los umbrales por defecto del arnés.

## Anti-objetivos

- Un gráfico que mezcle `edge` y `origin` y haga imposible saber qué se midió.
- Un panel que confunda los 429 de nginx con errores del backend.
- Un "dashboard" que solo muestre promedios y esconda p95, p99 y la saturación.
- Un formulario que escriba `JWT_SECRET`, `WORKER_AUTH_SECRET` o `PANEL_SECRET`
  en `settings.json`, `localStorage` o un reporte.

## Decisiones tomadas (decisiones del autor, no acuerdos con el operador)

- **Medio:** una app local de Vite + React + TypeScript + Tailwind en
  `apps/load-room`, workspace nuevo bajo `apps/*`. Se reutilizan las versiones
  de React, Tailwind y `recharts` que ya usa `apps/web`; no se inventa una pila.
- **Servidor:** `scripts/loadtest/control-room/server.mjs`, Node con módulos
  nativos (`http`, `child_process`, `fs`), sin dependencias nuevas. Sirve la UI
  construida, expone REST y SSE, y lanza `scripts/loadtest/run.mjs` como hijo.
  Escucha solo en `127.0.0.1`.
- **En vivo:** SSE con eventos `state`, `points`, `csv` y `log`. El servidor
  lee los JSON incrementales de `reports/` y el CSV del recolector; no necesita
  modificaciones profundas en `run.mjs`, que ya escribe punto por punto.
- **Parámetros:** `settings.json` gitignored guarda solo parámetros no secretos
  (perfil, camino, VUs, duración, VUs máximos, instancias, umbrales y escalones).
  Los secretos se envían por `POST /api/secrets` solo a la memoria del proceso
  y se muestran como "configurado / ausente", nunca como valor.
- **Seguridad local:** el servidor imprime al arrancar un token de sesión
  aleatorio; cada petición lo envía en una cabecera. Así un sitio web visitado
  por el operador no puede lanzar pruebas contra el servidor local.
- **Gráficas elegidas:** series temporales de RPS y VUs por escalón; latencia
  p50/p95/p99 con línea de umbral; errores y 429 como áreas apiladas separadas;
  CPU/memoria/red del VPS con marcadores de reinicio; curva de capacidad RPS
  frente a VUs; mapa de calor por endpoint; y dos curvas pequeñas de `edge` y
  `origin` una al lado de otra. No se usan gráficos circulares: responden mal a
  "cuándo" y a "cuánto", que es lo que importa aquí.
- **Diagrama de flujo:** un SVG del recorrido PC → k6 → `edge`/`origin` →
  backend → recolector VPS → `reports/` → panel, con el nodo activo resaltado.
  Es la respuesta a "¿qué se está haciendo?" sin leer logs.
- **Parada:** el botón de la UI escribe `scripts/loadtest/.stop`, el mismo
  interruptor que ya existe; no se inventa una señal nueva.

## Restricciones que el plan respeta

- k6 es un binario nativo, no una dependencia npm; `k6 version` es prerrequisito.
- El generador es Windows nativo, sin WSL, y las rutas relativas parten de la
  raíz del repo.
- `run.mjs` sigue siendo el único punto que lanza k6; la UI no invoca `k6 run`
  directamente.
- Los secretos solo viven en variables de entorno del proceso del servidor.
- Los perfiles de escritura siguen detrás de `K6_ALLOW_WRITES=1` y de la guarda
  de correos; la UI no relaja ninguna guarda.
- El proyecto es TypeScript-first y los cambios de UI pasan por los guardarraíles
  de diseño y `pnpm design:review`.

## Lo que queda al implementador

Los colores concretos del tema oscuro local, el espaciado y las etiquetas de
copy se deciden al construir, con tal de que no se mezclen con el tema público
ni con el tema `.admin-theme` del panel. La resolución de pantalla objetivo es
un navegador de escritorio de 1280 px o más; no se promete móvil.
