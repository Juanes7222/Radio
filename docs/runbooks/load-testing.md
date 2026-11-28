# Runbook: pruebas de carga con k6

Este procedimiento se ejecuta en una **ventana de mantenimiento acordada**. La
emisora puede caer: el objetivo es encontrar el primer recurso que se agota, no
mantener el servicio disponible. El generador es la PC del operador con Windows
nativo; la VPS de producción es el objetivo. Todas las conclusiones deben nombrar
el camino medido (`edge` o `origin`) y la mezcla de carga.

No se ejecuta nada de esto sin antes anunciar la ventana y confirmar que no hay
una persona al aire. Todas las rutas relativas se ejecutan desde la raíz del
repositorio. Los bloques `bash` son en la VPS; los bloques `powershell`, en la
PC. Reemplazar `<usuario>`, `<IP_PUBLICA_DE_LA_VPS>` y `<PUERTO_REAL>` por los
valores obtenidos en los pasos 3 y 4; anotarlos en el reporte.

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

**3. Obtener la IP pública y vaciar los correos de oración en la VPS.** Obtener
la IP desde la PC:

```powershell
curl.exe -s https://api.ipify.org
```

Los destinatarios de oración se leen de Infisical al arrancar; asignar la
variable en la PC no afecta al proceso remoto. Editar
`PRAYER_EMAIL_RECIPIENTS` en Infisical y luego, en la VPS:

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
terminar, pase lo que pase. El comando exacto depende del firewall de la VPS
(`ufw allow from ... to any port ... proto tcp`), y debe anotarse porque se
reutilizará con `ufw delete allow` en el cierre.

**6. Medir el RTT diez veces y calcular la mediana.**

```powershell
$samples = 1..10 | ForEach-Object {
  [double](curl.exe -o NUL -s -w "%{time_connect} %{time_starttransfer}" https://lavozverdad.com/api/nowplaying).Split(' ')[1]
} | Sort-Object
$env:K6_RTT_MEDIAN_MS = [string][math]::Round((($samples[4] + $samples[5]) / 2) * 1000)
```

Ese número es el RTT de `edge`: incluye TLS y nginx. `origin` entra al puerto
directo y no tiene una medición equivalente, así que el valor no se resta de la
curva de `origin`; se reporta como contexto del camino `edge`. La mediana en
milisegundos se usa al correlacionar.

**7. Preparar la comprobación de correos.** En la VPS, volcar el valor efectivo
que ve el proceso; con la variable vaciada el archivo queda vacío:

```bash
tr '\0' '\n' < /proc/$(pm2 pid radio-backend)/environ | grep '^PRAYER_EMAIL_RECIPIENTS=' | cut -d= -f2- > /tmp/prayer-recipients.txt
```

Copiarlo a la PC y apuntar la guarda a él:

```powershell
scp <usuario>@<IP_PUBLICA_DE_LA_VPS>:/tmp/prayer-recipients.txt reports/prayer-recipients.txt
$env:K6_EMAIL_CHECK_COMMAND = "type reports\prayer-recipients.txt"
```

Si el archivo no está vacío, `public-writes` se niega a arrancar con código 3.

**8. Iniciar el recolector en la VPS.** La secuencia completa tarda más de 15
minutos, así que el muestreo se fija en 60 minutos y se detiene a mano:

```bash
pid=$(pm2 pid radio-backend)
bash scripts/loadtest/monitor/collect.sh "$pid" 3600 reports/capacity.csv > /var/log/radio-collector.log 2>&1 &
echo $! > /tmp/radio-collector.pid
```

Anotar el PID. El recolector corre en la misma VPS y su propio coste se reporta
con la medición.

**9. Preparar el entorno de la PC.** El JWT se genera **dentro de la VPS**, con
el entorno efectivo de `radio-backend`:

```bash
infisical run -- node scripts/loadtest/auth/mint-admin-token.mjs
```

El script imprime solo el token en stdout y por stderr la cuenta elegida. Copiar
el stdout a `K6_ADMIN_TOKEN` y anotar esa cuenta en el reporte. Los permisos
necesarios son `dashboard`, `feedback` y `youtube`; un `401` indica `sub`/`tv`
equivocados y un `403`, permisos insuficientes en la fila. El panel recarga los
permisos desde la base en cada request.

`K6_WORKER_SECRET` y `K6_PANEL_SECRET` se leen de Infisical en la VPS y se
exportan **solo en el proceso de PowerShell de la sesión**, nunca a un archivo,
al repo ni a los reportes:

```powershell
$env:K6_PATH = "edge"
$env:K6_BASE_URL = "https://lavozverdad.com"
$env:K6_ORIGIN_URL = "http://<IP_PUBLICA_DE_LA_VPS>:<PUERTO_REAL>"
$env:K6_WORKER_SECRET = "<valor-leido-de-Infisical>"
$env:K6_PANEL_SECRET = "<valor-leido-de-Infisical>"
$env:K6_ADMIN_TOKEN = "<stdout-del-comando-anterior>"
$env:K6_BASELINE_RESTARTS = "<restarts-anotado-en-el-paso-3>"
```

El token dura una hora. Si la ventana se acerca a ese tiempo, volver a ejecutar
el comando de mint justo antes de los perfiles que usan el panel.

`JWT_SECRET`, `WORKER_AUTH_SECRET` y `PANEL_SECRET` no se escriben en disco; los
dos secretos de protocolo viajan como variables de entorno del proceso porque
los necesita el k6 que corre en la PC. El orquestador resuelve
`FEEDBACK_CATEGORIES.SUGERENCIA` desde `packages/types/src/feedback.ts`, sin que
el operador tenga que configurarlo.

## 2. Ejecución

Cada `pnpm load:*` imprime un `K6_MARKER`. Las escrituras son las únicas que dejan
filas: capturar el marcador de cada corrida de `writes` en un archivo y copiarlo
después a la VPS para la limpieza. Ejecutar en este orden:

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
pnpm load:writes --path edge --vus 5 --duration 1m 2>&1 | Tee-Object -FilePath reports/writes-edge.log
pnpm load:writes --path origin --vus 5 --duration 1m 2>&1 | Tee-Object -FilePath reports/writes-origin.log
$edgeMarker = (Select-String -Path reports/writes-edge.log -Pattern 'K6_MARKER=(\d+)').Matches[0].Groups[1].Value
$originMarker = (Select-String -Path reports/writes-origin.log -Pattern 'K6_MARKER=(\d+)').Matches[0].Groups[1].Value
Remove-Item Env:K6_ALLOW_WRITES

pnpm load:capacity --path origin --vus-max 800
pnpm load:capacity:mixed --path origin --vus-max 800
```

La capacidad se mide en `origin`: en `edge` el `limit_req` de nginx dominaría la
curva y no diría nada del backend. Para comparar la forma de la curva con el
limitador, ejecutar después, como medición separada y con otro nombre de
reporte, `pnpm load:capacity --path edge --vus-max 800`.

Si la curva de RPS sigue creciendo a 800 VUs en `origin`, repetir **los dos**
perfiles de capacidad en `origin`:

```powershell
pnpm load:capacity --path origin --vus-max 1600 --instances 2
pnpm load:capacity:mixed --path origin --vus-max 1600 --instances 2
```

Cada JSON lleva el id de instancia en el nombre (`-i1-`, `-i2-`);
`correlate.mjs` admite todos los JSON como argumentos y suma los RPS por minuto.

Para cortar una corrida, desde otra terminal:

```powershell
New-Item -ItemType File -Path scripts/loadtest/.stop | Out-Null
```

El orquestador borra el centinela. En Windows la salida es truncada:
`handleSummary()` puede no ejecutarse y el stdout no es evidencia; el JSON
incremental en `reports/` sí lo es. Registrar qué corridas se truncaron.

Durante la prueba de escrituras, registrar el CPU de la PC. Si hay
`dropped_iterations` o la PC supera el 90 % de CPU, la conclusión es "saturó el
generador" y la muestra se descarta, no "saturó la emisora".

## 3. Cierre, sin saltos

**1. Detener el recolector y copiar su CSV a la PC.**

```bash
kill "$(cat /tmp/radio-collector.pid)"
```

```powershell
scp <usuario>@<IP_PUBLICA_DE_LA_VPS>:reports/capacity.csv reports/capacity.csv
```

**2. Confirmar la ruta real de la base en la VPS** y anotarla:

```bash
ls -l /var/www/radio/backend/prisma/dev.db
```

**3. Limpiar las filas de prueba.** En la VPS, con los dos marcadores copiados
de la PC (sustituir los valores impresos):

```bash
sqlite3 /var/www/radio/backend/prisma/dev.db < <(node scripts/loadtest/lib/cleanup.mjs <MARCORIGIN>)
sqlite3 /var/www/radio/backend/prisma/dev.db < <(node scripts/loadtest/lib/cleanup.mjs <MARCEDGE>)
```

`cleanup.mjs` ya incluye `BEGIN TRANSACTION;` y `COMMIT;`, así que las tres
sentencias de cada marcador se ejecutan de forma atómica. Verificar con tres
consultas que queden cero filas:

```bash
sqlite3 /var/www/radio/backend/prisma/dev.db "SELECT COUNT(*) FROM prayer_requests WHERE request LIKE '%<MARCADOR>%'; SELECT COUNT(*) FROM feedback_messages WHERE mensaje LIKE '%<MARCADOR>%'; SELECT COUNT(*) FROM devices WHERE deviceId LIKE 'k6-<MARCADOR>%';"
```

Repetir para los dos marcadores. Si el sqlite3 de la VPS no admite sustitución de
proceso, ejecutar `node scripts/loadtest/lib/cleanup.mjs <marcador>` y pegar la
salida en `sqlite3`.

**4. Revisar correos y reinicios.** Cero entradas nuevas de "Failed to send
prayer email" durante la ventana:

```bash
grep "Failed to send prayer email" /var/log/pm2/radio-backend-error.log | tail -20
```

Comparar `restarts` con la línea base con el mismo comando del paso 3. Un
reinicio por `max_memory_restart: 300M` es un evento, no una caída aleatoria.

**5. Cerrar y verificar la regla de firewall** con el comando inverso del que se
usó para abrirla. Desde la PC, la verificación debe fallar:

```powershell
curl.exe --max-time 5 http://<IP_PUBLICA_DE_LA_VPS>:<PUERTO_REAL>/health
```

Expected: error de conexión o timeout. Si responde, la regla sigue abierta.

**6. Archivar y correlacionar.** Archivar los JSON incrementales y los logs:

```powershell
Compress-Archive -Path reports/* -DestinationPath reports/load-$(Get-Date -Format yyyyMMdd).zip
node scripts/loadtest/monitor/correlate.mjs reports/capacity-origin-i1-*.json reports/capacity-mixed-origin-i1-*.json reports/capacity.csv reports/capacity.md
```

Con dos instancias, pasar también los `-i2-*.json`, sin comodines que dejen
fuera archivos. `K6_RTT_MEDIAN_MS` ya está en el entorno del paso 6.

**7. Restaurar y verificar los correos de oración.** Restaurar
`PRAYER_EMAIL_RECIPIENTS` en Infisical y ejecutar `pm2 restart radio-backend`.
Verificar que el valor efectivo ya no está vacío:

```bash
tr '\0' '\n' < /proc/$(pm2 pid radio-backend)/environ | grep '^PRAYER_EMAIL_RECIPIENTS=' | cut -d= -f2-
```

**8. Confirmar que la radio volvió al aire** en el estado en vivo del panel.

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

Los umbrales iniciales implementados son `p(95) < 1500` en ambos caminos y
`http_req_failed < 0.01`; el objetivo de `p(95) < 800` en `origin` que propone el
plan queda como recalibración pendiente de la primera medición de referencia y
debe registrarse aquí cuando se ajuste. Tras esa primera referencia los umbrales
se recalibran con criterio. Los `429` de `limit_req`
en `edge` son limitación de nginx, nunca fallo del backend: se excluyen del
coste del backend y se reportan por separado.
