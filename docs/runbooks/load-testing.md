# Runbook: pruebas de carga con k6

Este procedimiento se ejecuta en una **ventana de mantenimiento acordada**. La
emisora puede caer: el objetivo es encontrar el primer recurso que se agota, no
mantener el servicio disponible. El generador es la PC del operador con Windows
nativo; la VPS de producción es el objetivo. Todas las conclusiones deben nombrar
el camino medido (`edge` o `origin`) y la mezcla de carga.

No se ejecuta nada de esto sin antes anunciar la ventana y confirmar que no hay
una persona al aire.

## 1. Preparación, en este orden

**1. Verificar k6 en la PC.**

```powershell
k6 version
```

Si el comando no existe: `winget install k6`, cerrar y reabrir PowerShell.
`pnpm exec k6` no funciona porque k6 no es una dependencia npm.

**2. Anunciar la ventana y confirmar que no hay streamer al aire.** Revisar el
estado en vivo del panel. El watchdog no permite que un aviso propio desconecte
a una persona, pero la prueba de carga no debe competir con una emisión real.

**3. Vaciar los correos de oración en la VPS y reiniciar el backend.** Los
destinatarios se leen de Infisical al arrancar; asignar la variable en la PC no
afecta al proceso remoto. Editar `PRAYER_EMAIL_RECIPIENTS` en Infisical y luego:

```bash
pm2 restart radio-backend
```

Anotar la línea base de reinicios (campo `restarts`, no `restart_count`):

```bash
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name==="radio-backend");console.log(p.pm2_env.restarts)})'
```

Si no se puede vaciar la variable, **no ejecutar el perfil de escrituras**. Los
correos reales saldrían durante la prueba.

**4. Confirmar el puerto real del backend.**

```bash
ss -lntp | grep node
```

nginx usa 3000, pero el código defaulta `PORT` a 3001. `127.0.0.1:3000` en la PC
apuntaría a la propia PC y no mediría nada.

**5. Abrir la regla temporal de firewall** para el puerto real solo desde la IP
pública de la PC, y verificar:

```powershell
curl.exe http://<IP_PUBLICA_DE_LA_VPS>:<PUERTO_REAL>/health
```

No usar túnel SSH: añade un salto y falsea la latencia. Cerrar esta regla al
terminar, pase lo que pase.

**6. Medir el RTT diez veces y anotar la mediana.**

```powershell
1..10 | ForEach-Object { curl.exe -o NUL -s -w "%{time_connect} %{time_starttransfer}`n" https://lavozverdad.com/api/nowplaying }
```

`edge` incluye ese RTT; `origin` incluye solo el trayecto hasta el puerto
directo, sin nginx. Exportar la mediana en milisegundos como
`K6_RTT_MEDIAN_MS` antes de correlacionar.

**7. Iniciar el recolector en la VPS.**

```bash
pid=$(pm2 pid radio-backend)
bash scripts/loadtest/monitor/collect.sh "$pid" 900 reports/capacity.csv > /var/log/radio-collector.log 2>&1 &
echo $! > /tmp/radio-collector.pid
```

Anotar el PID. El recolector corre en la misma VPS y su propio coste se reporta
con la medición.

**8. Preparar el entorno de la PC.** Solo secretos de protocolo y el JWT; nunca
`JWT_SECRET`, `WORKER_AUTH_SECRET` ni `PANEL_SECRET`:

```powershell
$env:K6_PATH = "edge"
$env:K6_BASE_URL = "https://lavozverdad.com"
$env:K6_ORIGIN_URL = "http://<IP_PUBLICA_DE_LA_VPS>:<PUERTO_REAL>"
$env:K6_WORKER_SECRET = "<secreto-de-worker>"
$env:K6_PANEL_SECRET = "<secreto-de-panel>"
$env:K6_ADMIN_TOKEN = "<jwt-obtenido-dentro-de-la-vps>"
```

El JWT se genera **dentro de la VPS**, con el entorno efectivo de
`radio-backend`:

```bash
infisical run -- node scripts/loadtest/auth/mint-admin-token.mjs
```

El script imprime solo el token en stdout y por stderr la cuenta elegida.
Anotar esa cuenta en el reporte. Para `edge` y `origin` se usa el mismo token;
un `401` indica `sub`/`tv` equivocados y un `403`, permisos insuficientes en la
fila. El panel recarga los permisos desde la base en cada request.

`K6_EMAIL_CHECK_COMMAND` debe ser una orden de solo lectura que imprima el
valor efectivo de `PRAYER_EMAIL_RECIPIENTS` en la VPS; salida vacía = variable
vaciada. Sin ella `public-writes` se niega a arrancar.

## 2. Ejecución

Cada `pnpm load:*` imprime un `K6_MARKER`. Copiarlo: se necesita para limpiar.
Ejecutar en este orden:

```powershell
pnpm load:smoke --path edge --vus 1 --duration 30s
pnpm load:smoke --path origin --vus 1 --duration 30s
pnpm load:reads --path edge --vus 20 --duration 2m
pnpm load:reads --path origin --vus 20 --duration 2m
pnpm load:search --path origin --duration 1m
pnpm load:admin --path edge --vus 10 --duration 2m
pnpm load:admin --path origin --vus 10 --duration 2m
pnpm load:workers --path origin --vus 1 --duration 2m
$env:K6_ALLOW_WRITES = "1"   # solo si el paso 3 vació los correos
pnpm load:writes --path edge --vus 5 --duration 1m
pnpm load:writes --path origin --vus 5 --duration 1m
$env:K6_VUS_MAX = "800"
pnpm load:capacity --vus-max 800
pnpm load:capacity:mixed --vus-max 800
```

Si la curva de RPS sigue creciendo a 800 VUs en `origin`, repetir con
`--vus-max 1600 --instances 2`. Cada JSON lleva el id de instancia en el nombre;
`correlate.mjs` suma los RPS por minuto.

Para cortar una corrida, crear `scripts/loadtest/.stop`. En Windows la salida
es truncada: `handleSummary()` puede no ejecutarse y el stdout no es evidencia;
el JSON incremental en `reports/` sí lo es.

Durante la prueba de escrituras, registrar el CPU de la PC. Si hay
`dropped_iterations` o la PC supera el 90 % de CPU, la conclusión es "saturó el
generador" y la muestra se descarta, no "saturó la emisora".

## 3. Cierre, sin saltos

1. Detener el recolector: `kill "$(cat /tmp/radio-collector.pid)"`.
2. Limpiar las filas de prueba con el marcador impreso:

   ```bash
   sqlite3 /var/www/radio/backend/prisma/dev.db < <(node scripts/loadtest/lib/cleanup.mjs <K6_MARKER>)
   ```

   Ejecutar las tres sentencias en una sola transacción y repetir las consultas:
   cero filas con el marcador en `prayer_requests`, `feedback_messages` y
   `devices`. La ruta real de la base se confirma en la VPS y se anota aquí.
3. Revisar `/var/log/pm2/radio-backend-error.log` durante la ventana: cero
   entradas nuevas de "Failed to send prayer email". Si aparece alguna, detener
   y corregir antes de continuar.
4. Cerrar la regla temporal de firewall.
5. Verificar `restarts` contra la línea base. Un reinicio por
   `max_memory_restart: 300M` es un evento, no una caída aleatoria.
6. Archivar `reports/` y correlacionar:

   ```powershell
   node scripts/loadtest/monitor/correlate.mjs reports/capacity-origin.json reports/capacity-mixed-origin.json reports/capacity.csv reports/capacity.md
   ```

7. Restaurar `PRAYER_EMAIL_RECIPIENTS` en Infisical y ejecutar
   `pm2 restart radio-backend`.
8. Confirmar que la radio volvió al aire.

## 4. Qué NO se carga y por qué

| Superficie | Razón de la exclusión |
| --- | --- |
| `/live-status/` | Límite propio de 40 conexiones de nginx; mide ese límite, no el backend. |
| `/listen/la_voz_de_la_verdad/` | Es el stream de audio; tiene límite de 60 y queda fuera de la ventana. |
| Conexiones SSE | Transporte de larga duración con semántica distinta a la de RPS. |
| `/admin-api/workers/upload` | Recibe artefactos y dispara despliegues de workers. |
| `/admin-api/worker-releases` | Gestiona versiones de workers. |
| Webhook de YouTube | Crea `YouTubeVideo` y jobs de procesamiento. |
| `/api/telemetry` sostenido | 20 escrituras/min por dispositivo; ensuciaría la base. |
| `/api/search` en tráfico mixto | Cache fría costosa contra AzuraCast; se mide aislado. |
| `/admin-api/nowplaying` en tráfico sostenido | Proxy sin caché a AzuraCast; se mide como llamada aislada. |
| `/station/:stationId/art/:artId` | Hasta 45 s de latencia y portadas desactivadas en el frontend. |
| `/api/schedule/categories` | Clave de caché global `__all__`; no permite distinguir frío de caliente. |
| Cualquier endpoint que inicie jobs o cambie el estado de AzuraCast | Los efectos secundarios contaminan la medición y la emisión. |

Aviso: durante el perfil de escrituras, los paneles abiertos recibirán peticiones
SSE falsas (`broadcastPrayerCreated`). Cada prayer también hace `upsert` de un
`Device`; ambos efectos cuentan como carga y como rastro a limpiar.

## 5. Criterios de saturación y calibración

El primer escalón saturado es el primero en que ocurre cualquiera de: p95 >
2000 ms, errores > 5 %, CPU > 85 % del total de núcleos durante dos minutos,
memoria disponible < 10 %, RPS sin crecer al subir de escalón, `restarts` por
encima de la línea base, o iteraciones descartadas en el generador.

Los umbrales iniciales (`p(95) < 1500` en `origin`, `< 1500` en `edge`,
`http_req_failed < 0.01`) son punto de partida. Tras la primera referencia se
recalibran con criterio y el cambio se registra aquí. Los `429` de `limit_req`
en `edge` son limitación de nginx, nunca fallo del backend: se excluyen del
coste del backend y se reportan por separado.
