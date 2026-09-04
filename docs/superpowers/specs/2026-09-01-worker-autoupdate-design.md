# Diseño: Auto-actualización silenciosa de Workers en IDLE

**Fecha:** 2026-09-01
**Estado:** Aprobado
**Autor:** brainstorm con stakeholder
**Stack:** Express + Prisma + WebSocket (`ws`), Worker Windows (Node portable + WinSW), Electron installer (NSIS)

## 1. Resumen y objetivo

Permitir que los workers instalados en PCs domésticos Windows fuera de control se actualicen de forma silenciosa y automática cuando están en `IDLE`, sin interrumpir jobs en curso. Las actualizaciones son esporádicas. El operador sube la nueva versión vía panel admin; los workers la detectan por el canal WebSocket existente, la descargan de forma autenticada, verifican integridad y se auto-reemplazan con rollback automático.

No se introduce dependencia externa (GitHub Releases, Docker, MDM). Se reutiliza la infraestructura actual: WS, `WORKER_AUTH_SECRET`, WinSW.

## 2. Contexto actual

- Worker: `worker/worker` (bundle `dist/main.js` ejecutado con `resources/bins/node.exe`) + servicio Windows `LaVozWorker` gestionado por `WinSW.exe`. Instalado en `%LOCALAPPDATA%/LaVozWorker`.
- Protocolo WS: `register`, `heartbeat`, `ping/pong`, `assign_job` / `job_*`. Sin concepto de versión ni actualización.
- Backend: `backend/src/modules/workers/workerServer.ts` y `workerPool.ts` gestionan conexiones. No hay almacenamiento de releases.
- Instalación actual requiere re-ejecutar el instalador Electron manualmente.

## 3. Requisitos

### Funcionales
- RF1: Admin autenticado puede subir un artefacto de nueva versión del worker desde el panel.
- RF2: Worker reporta su `version` en `register` y queda visible en `GET /workers`.
- RF3: Backend notifica a workers conectados que hay nueva versión disponible vía WS.
- RF4: Worker solo descarga y aplica la actualización cuando `activeJobs === 0` y `status === idle`. Si está `busy`, la aplaza hasta quedar `idle`.
- RF5: Descarga autenticada con `WORKER_SECRET` y verificación `sha256` obligatoria.
- RF6: Aplicación atómica con backup y rollback si el reinicio falla.

### No funcionales
- RNF1: No interrumpir jobs. Actualización nunca en `DOWNLOADING`/`UPLOADING`.
- RNF2: Releases esporádicos: simplicidad sobre optimización de tamaño. Artefacto típico `worker-dist.zip` (2-5 MB). Bins pesados (ffmpeg/node/yt-dlp) solo cuando cambian.
- RNF3: Seguridad: rechazo si hash no coincide, endpoint protegido.
- RNF4: Observabilidad: admin ve versión de cada worker y estado de actualización.

### Fuera de alcance (v1)
- Delta/patch binario, electron-updater, Docker, actualización de `yt-dlp.exe`/`ffmpeg.exe` por separado (se hará como `full-bundle` cuando toque).

## 4. Arquitectura propuesta

```
[Admin Panel] --POST /admin/worker-releases (multipart ZIP)--> [Backend Express]
                                                              |-> FS: data/worker-releases/<version>.zip
                                                              |-> DB: WorkerRelease
                                                              |-> WS broadcast: {type:"update_available", version, sha256, url}
[Worker PC] <--WS update_available-- [Backend WS Server]
    |-> si idle: GET /workers/updates/latest (x-worker-secret) -> descarga -> verifica sha256
    |-> descomprime a INSTALL_DIR/.pending -> swap atómico -> WinSW restart -> re-register con nueva version
    |-> si busy: marca pendingUpdate, aplica al pasar a idle
```

Backend es fuente de verdad. Workers hacen pull, nunca push de binarios desde admin.

## 5. Modelo de datos

### Prisma

```prisma
model WorkerRelease {
  id        String   @id @default(cuid())
  version   String   @unique // semver, ej. "1.1.0"
  sha256    String
  size      Int
  filePath  String   // relativo a data/worker-releases/
  mandatory Boolean  @default(false)
  createdAt DateTime @default(now())
  createdBy String?  // userId admin
}

model WorkerNode {
  // existente, añadir:
  version   String?  // última versión reportada
}
```

Migración: `prisma migrate` añade campos. `WorkerNode.version` nullable para compatibilidad con workers viejos.

## 6. API y protocolo

### Backend HTTP

- `POST /admin/worker-releases` — `requireAuth` (admin). Body: `multipart/form-data` con `file` (ZIP) + `version` (semver) + `mandatory` (bool). Valida semver único, calcula `sha256` servidor, guarda en `data/worker-releases/`, crea registro DB, dispara broadcast WS. Respuesta `201 {version, sha256, size}`.
- `GET /admin/worker-releases` — lista releases (admin).
- `GET /workers/updates/latest` — auth por `x-worker-secret === WORKER_AUTH_SECRET`. Retorna `{version, sha256, size, mandatory, downloadUrl: "/workers/updates/:version/download"}` si hay versión más nueva que la del worker (header `x-worker-version` o query `?current=`), si no `204`.
- `GET /workers/updates/:version/download` — auth `x-worker-secret`, stream del ZIP con `Content-Type: application/zip`.

### WebSocket

Extender `protocol.types.ts` (ambos lados):

```ts
// Server -> Worker
| { type: "update_available"; version: string; sha256: string; url: string; mandatory: boolean }
| { type: "acknowledge"; ... } // existente

// Worker -> Server (extender RegisterMessage)
interface RegisterMessage {
  type: "register";
  workerId: string;
  secret: string;
  name: string;
  maxConcurrentJobs: number;
  version: string; // nuevo, ej. "1.0.0" desde package.json
}
```

Opcional: `worker -> server` `{type:"update_status", version, status:"downloading|applied|failed"}` para observabilidad (v1 puede omitirse, usar re-register).

## 7. Lógica de actualización en Worker

Nuevo módulo `worker/worker/src/updater.ts`:

```ts
export async function handleUpdateAvailable(msg: UpdateAvailableMessage): Promise<void>
```

Flujo:

1. Recibe `update_available`. Si `msg.version === currentVersion`, ignora.
2. Si `activeJobs > 0` o `status === "busy"`, guarda `pendingUpdate = msg` y retorna. Se re-evaluará en `finally` de `handleJob` cuando `activeJobs` pase a 0.
3. Si `idle`, inicia `downloadAndVerify(url, sha256)` con `axios` (stream a `INSTALL_DIR/.pending.zip`, calcula hash incremental).
4. Si hash mismatch, borra `.pending.zip`, log error, aborta.
5. Descomprime a `INSTALL_DIR/.pending/` (usar `unzip` nativo o dependencia ligera `yauzl`/`unzipper`).
6. Valida que `.pending/main.js` existe.
7. Backup: renombra `INSTALL_DIR/main.js` a `main.js.bak` y `dist/` a `dist.bak` si existe.
8. Swap: mueve `.pending/*` a `INSTALL_DIR/`.
9. Ejecuta `WinSW.exe restart` (o `stop` + `start` si `restart` no disponible). El proceso actual morirá; WinSW lo relanzará con nuevo `main.js`.
10. Al arrancar, `main.ts` loguea nueva versión y `register` la envía.

Rollback: si tras swap el servicio no logra reconectar en 60s (detectado por backend `pruneDeadWorkers`), admin ve worker offline con versión nueva; operador puede instruir rollback manual. Automático local: si `main.js` nuevo falla al arrancar (uncaughtException), wrapper podría restaurar `.bak` — v1 simple: mantiene `.bak` para restauración manual vía panel `POST /admin/workers/:id/rollback` que envía `force_update` a versión anterior (futuro).

Dependencias nuevas worker: `unzipper` o `yauzl` + `semver` para comparar versiones.

### Integración en `workerClient.ts`

- Añadir `currentVersion` leído de `package.json` o `config.ts`.
- Enviar `version` en `register`.
- Añadir `case "update_available": void handleUpdateAvailable(msg)` en `socket.on("message")`.
- En `handleJob` `finally`, si `pendingUpdate && activeJobs===0`, disparar update.

### Config

`worker/worker/src/config.ts` añade `version: require("../../package.json").version`.

## 8. Almacenamiento

- Directorio `backend/data/worker-releases/` (gitignore). Volumen persistente en producción.
- Nombre archivo: `<version>.zip` + `<version>.sha256` sidecar opcional.
- Límite tamaño: 50 MB (configurable `WORKER_RELEASE_MAX_SIZE_MB`).
- Retención: mantener últimas 5 versiones, borrar antiguas (job de limpieza).

## 9. Seguridad

- Upload solo `requireAuth` + rol admin (ya existente `requireAuth`).
- Download solo si `x-worker-secret === WORKER_AUTH_SECRET`. No exponer sin auth.
- `sha256` calculado en servidor y verificado en worker; mismatch = abort.
- Validación ZIP: solo permite archivos dentro de `dist/` y `main.js`, rechaza paths absolutos o `..`.
- Semver validado con regex `^\d+\.\d+\.\d+$`.

## 10. Admin UI

- Ruta existente `apps/web` (o `backend` admin): sección Workers > tabla actual añade columna `Versión`.
- Botón "Subir nueva versión" → modal con `version` + `file` + `mandatory` checkbox.
- Lista de releases con fecha y tamaño.
- Indicador "N workers desactualizados".

## 11. Manejo de errores y casos borde

| Caso | Comportamiento |
|------|----------------|
| Worker `busy` al recibir push | Guarda pending, aplica al quedar idle |
| Descarga interrumpida | Borra parcial, reintenta en próximo `update_available` o polling fallback cada 6h |
| Hash mismatch | Aborta, log error, no aplica, reporta `update_failed` |
| ZIP corrupto | Aborta, mantiene versión actual |
| Reinicio falla (WinSW error) | Mantiene `.bak`, log, worker sigue en versión vieja hasta intervención |
| Worker viejo sin `version` | Backend lo considera `0.0.0`, le notifica update |
| Múltiples releases seguidos | Solo aplica la última (`latest`) |

Polling fallback: además de push WS, worker hace `GET /workers/updates/latest` cada 6h por si estuvo offline durante el broadcast.

## 12. Archivos a tocar

- `backend/prisma/schema.prisma` — modelos `WorkerRelease`, campo `WorkerNode.version`
- `backend/src/modules/workers/protocol.types.ts` — nuevos tipos WS
- `backend/src/modules/workers/workerServer.ts` — broadcast `update_available`, manejo `version` en register
- `backend/src/modules/workers/workerPool.ts` — exponer `getAllWorkers` con version
- `backend/src/modules/workers/releases.routes.ts` — nuevo (upload/list/download)
- `backend/src/modules/workers/releases.service.ts` — nuevo (cálculo hash, FS)
- `backend/src/app.ts` — montar rutas releases
- `worker/worker/package.json` — versión, deps `unzipper`, `semver`
- `worker/worker/src/config.ts` — exponer `version`
- `worker/worker/src/updater.ts` — nuevo
- `worker/worker/src/workerClient.ts` — integrar updater
- `worker/worker/src/types/protocol.types.ts` — sincronizar tipos
- `apps/web/src/pages/AdminWorkers.tsx` (o equivalente) — UI releases

Estimación: 2-3 archivos nuevos, ~8 modificados. Sin cambios en AzuraCast, jobs, ni scheduler.

## 13. Alternativas descartadas

- **Electron autoUpdater + GitHub Releases:** solo actualiza installer, no servicio headless; requiere repo público y gestión de tokens. Descartado para PCs domésticos con servicio WinSW.
- **Docker/Watchtower:** no aplica a Windows hogar.
- **Delta patches:** complejidad innecesaria para releases esporádicos.

## 14. Plan de migración y despliegue

1. Deploy backend con nueva migración Prisma y endpoints (workers viejos siguen funcionando, `version` nullable).
2. Workers actuales siguen reportando sin `version` → se les notifica update en próximo release.
3. Primer release: subir `worker-dist.zip` v1.1.0 vía panel, verificar que workers idle se actualizan.
4. Documentar en `worker/.env.example` y `docs/backend-context.md` el nuevo flujo.

Rollback backend: revertir migración (drop tabla) no afecta workers existentes.

## 15. Testing

- Unit: `releases.service` calcula sha256, valida semver, rechaza ZIP malformado.
- Unit: `updater` verifica hash, aborta si mismatch, respeta `activeJobs > 0`.
- Integración: subir ZIP vía `POST /admin/worker-releases`, worker idle descarga y reinicia, worker busy aplaza.
- Manual: desconectar worker durante broadcast, reconectar y verificar polling fallback a las 6h.

## 16. Riesgos abiertos

- Tamaño real del artefacto si incluye bins: si supera 50 MB, subir límite o separar `worker-dist` vs `full-bundle`. Decisión diferida a primer release (medir `pnpm build` output).
- Permisos de escritura en `INSTALL_DIR` (requiere servicio con permisos de escritura — WinSW ya corre como SYSTEM, ok).
- Antivirus Windows bloqueando reemplazo de `main.js` en caliente — mitigado con `WinSW stop` antes de swap en v2 si ocurre.

## 17. Decisión

Aprobado enfoque A: panel upload + WS push + pull autenticado + verificación + swap atómico en IDLE con backup.
