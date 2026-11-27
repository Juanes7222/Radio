# Diseño de pruebas de carga con k6 para la emisora

> Documento de diseño. El plan de implementación derivado está en `docs/k6-load-testing-plan.md`.

**Fecha:** 2026-11-26

## Intención y por qué

El usuario quiere responder tres preguntas sobre la emisora con evidencia, no con corazonadas: cuántos usuarios soporta, dónde está el primer cuello de botella y cómo se comportan CPU, memoria, ancho de banda y latencia al aumentar la carga. El descubrimiento de Grafana k6 es el medio, no el fin.

Las pruebas se ejecutarán contra la VPS de producción real, en una ventana de mantenimiento acordada. El usuario acepta explícitamente que el sistema puede caer durante la prueba; el objetivo es llevarlo al límite, no mantenerlo disponible.

## Objetivos

- Medir la capacidad máxima sostenible, expresada en peticiones por segundo y en usuarios virtuales, antes de que aparezca la degradación.
- Identificar el primer recurso que se agota, con evidencia correlacionada de k6 y del VPS.
- Cubrir las tres superficies del sistema: API pública, panel de administración y protocolo de workers, más el efecto de las escrituras en SQLite.
- Dejar un arnés modular y repetible, con umbrales explícitos y un procedimiento operativo para repetir la medición tras cada cambio relevante.

## No objetivos

- No modificar el código de producción para hacer la prueba más fácil.
- No cargar el stream de audio en vivo ni las conexiones SSE; están fuera de la ventana de mantenimiento y tienen límites propios de nginx que no dicen nada del backend.
- No disparar trabajos de procesamiento, ingestionas de YouTube ni cierre/reinicio de AzuraCast desde las pruebas.
- No convertir k6 en una suite de tests funcionales; los `checks` solo validan que la respuesta sea creíble.
- No instalar ni configurar Grafana Cloud; se usa k6 OSS y exportación local.

## Anti-objetivos

- Meter la conclusión "el sistema aguanta N usuarios" sin decir qué camino y qué mezcla de carga se midió, ni qué latencia y tasa de error se aceptaron.
- Culpar a Prisma o a AzuraCast por una latencia que en realidad es el `limit_req` de nginx, el RTT de la conexión doméstica o un túnel mal contabilizado.
- Dejar filas de prueba de oración y opiniones, o dispositivos huérfanos, en la base de producción sin una marca que permita borrarlos.

## Decisiones tomadas

- **Generador:** la PC del usuario (Ryzen 5 7600X, 32 GB de RAM, 900 Mb simétricos), ejecutando k6 de forma nativa en Windows. Suficiente para saturar un VPS típico; la GPU no interviene. Se medirá el RTT al inicio y se reportará por separado. Para la prueba final se lanzarán dos instancias de k6 en la misma PC si una sola no alcanza a saturar.
- **Camino `origin`:** el backend se alcanza en la IP pública de la VPS, puerto 3000, con una regla temporal de firewall que solo permite la IP pública de la PC. `127.0.0.1:3000` sería el loopback de la PC y no mide nada del servidor. Este camino evita nginx pero **sí incluye el RTT de internet**, que se mide por separado y se resta de la comparación. No se usa un túnel SSH porque añadiría un salto adicional y ensuciaría la latencia.
- **Orquestador:** un script `run.mjs` de Node invocado desde `pnpm`, multiplataforma, con perfiles por superficie y un interruptor de parada por archivo centinela. No se usa WSL2 por defecto.
- **Lenguaje de los scripts k6:** JavaScript con `// @ts-check` y JSDoc. k6 no ejecuta TypeScript directamente; el chequeo estático se mantiene con `tsconfig.json` de `checkJs`. Esta es la excepción justificada a la convención TypeScript-first del repositorio.
- **Doble medición:** todo perfil de carga (público, panel, workers y escrituras) se ejecuta en dos caminos etiquetados: `edge` (a través de `https://lavozverdad.com`, con cachés y `limit_req` reales) y `origin` (directo al puerto 3000 de la VPS, sin el limitador de nginx). Toda conclusión debe nombrar el camino medido.
- **Caché:** se mide frío y caliente. Las cachés en memoria se sortean variando `Host`/`X-Forwarded-Host` por VU en el camino `origin`; en `edge` se documenta que nginx y Express pueden servir la copia en memoria.
- **429 esperados:** k6 cuenta como fallo toda respuesta con status ≥ 400. Los `429` producidos por `limit_req` en `edge` se etiquetan `throttled: true` y se excluyen del umbral global con la sub-métrica `http_req_failed{throttled:no}`. Nunca se presentan como fallos del backend.
- **Escrituras:** quedan detrás de una variable explícita `K6_ALLOW_WRITES=1`. El payload de prayer usa los campos reales `name` y `request` (no `mensaje`, ni `consent`); el de feedback usa `SUGERENCIA`, `mensaje` y `consent: true`. Cada fila lleva un marcador único. La limpieza borra las filas de `prayer_requests` por `request`, las de `feedback_messages` por `mensaje` y las filas de `devices` creadas con el `deviceId` de prueba.
- **Autenticación del panel:** se usa un JWT HS256 firmado con el `JWT_SECRET` leído de la VPS en el momento de la prueba, para un `AdminUser` real y activo cuyo `sub`, `role` y `tokenVersion` se toman de la fila. Los permisos necesarios son `dashboard`, `feedback` y `youtube`; `/admin-api/nowplaying` solo exige `requireAuth`. No se hace login por VU, porque `POST /admin-api/auth/google` está limitado a 30 intentos / 10 min por IP.
- **Seguridad:** secretos solo por variables de entorno; nunca en los scripts ni en los resultados; los resúmenes no incluyen cuerpos de respuesta.
- **Capacidad:** se reportan dos cifras, la de lectura pública pura y la de una mezcla representativa con panel y workers. El titular "capacidad de la emisora" siempre va acompañado del camino y de la mezcla medidos.

## Restricciones del sistema que el plan respeta

- nginx: `/api/` a 10 r/s con `burst=60 nodelay`, `/api/` y `/admin-api/` con zonas de conexión, `/live-status/` a 40 conexiones, `/listen/la_voz_de_la_verdad/` a 60, `/admin-api/auth/google` a 30 intentos / 10 min por IP, y `/api/telemetry` a 20 escrituras / min por dispositivo. El prefijo `/admin-api/` y `/panel-api/` usan la zona `general` de 30 r/m en `edge`.
- Cachés en memoria del backend: `/api/nowplaying` 5 s, `/api/schedule` y `/api/schedule/categories` 60 s, `/api/search` 10 min.
- PM2 corre una sola instancia con `max_memory_restart: 300M`: un reinicio por memoria debe registrarse como evento, no interpretarse como caída aleatoria.
- `PRAYER_EMAIL_RECIPIENTS` se lee desde Infisical al arrancar. Vaciarlo implica reiniciar el backend, lo que reinicia `restart_count` y la línea base de memoria; por eso debe hacerse antes de iniciar la medición y registrarse en el runbook. Si no puede vaciarse, el perfil de escrituras no se ejecuta.
- Timeouts de AzuraCast: 15 s para API, 300 s para subidas, 10 s para llamadas cortas.
- `trust proxy = 1`: detrás de nginx, Express lee la última entrada de `X-Forwarded-For`, que nginx sobrescribe con la IP real. En el camino `origin` se puede simular IP por VU con `X-Forwarded-For`; en `edge` no.
- `POST /api/prayer` hace `upsert` de `Device` y emite `broadcastPrayerCreated` por SSE; ambos efectos cuentan como carga y como rastro a limpiar.
- PM2 y nginx no se tocan durante la prueba; solo se observa su estado, salvo la regla temporal de firewall para el camino `origin`.

## Lo que queda al implementador

Los umbrales numéricos iniciales y los escalones de carga están propuestos en el plan como punto de partida. Después de la primera medición de referencia se ajustan con criterio y se registra el cambio en el runbook; no se inventan umbrales "de academia" desconectados de lo que el sistema puede hacer. La IP pública de la VPS y la cuenta administrativa de prueba se confirman con el operador antes de abrir la ventana de mantenimiento; son datos del despliegue, no decisiones del plan.
