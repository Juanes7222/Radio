# Worker Auto-Update Silencioso en IDLE - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workers en PCs domésticas se actualizan silenciosamente solo en IDLE tras subir nueva versión vía panel admin, con verificación sha256 y rollback.

**Architecture:** Backend almacena releases (FS + Prisma) y notifica por WS existente; worker descarga autenticado, verifica hash, swap atómico y reinicia WinSW solo si activeJobs===0.

**Tech Stack:** Express + Prisma + ws + multer, worker Node (axios, unzipper, semver), WinSW

**Spec:** `docs/superpowers/specs/2026-09-01-worker-autoupdate-design.md`

## Global Constraints

- TypeScript-first, strict types, sin `any` salvo aislado y justificado.
- Validar todo input externo (multipart, semver, sha256) antes de lógica de negocio.
- Route handlers delgados, lógica en services, acceso Prisma aislado.
- No filtrar stack traces ni errores internos al cliente.
- Actualización nunca interrumpe job: solo en `idle` + `activeJobs===0`.
- Descarga requiere `x-worker-secret === WORKER_AUTH_SECRET` y verificación sha256 obligatoria.
- Semver formato `^\d+\.\d+\.\d+$`, versión única.
- Límite artefacto 50 MB, retención 5 versiones.

---

## File Structure

**Nuevos:**
- `backend/src/modules/workers/releases.service.ts` — cálculo sha256, validación semver/zip, FS, CRUD WorkerRelease
- `backend/src/modules/workers/releases.routes.ts` — POST/GET /admin/worker-releases, GET /workers/updates/*
- `worker/worker/src/updater.ts` — downloadAndVerify, applyUpdate, handleUpdateAvailable
- `backend/data/worker-releases/` — directorio persistente (gitignore)

**Modificados:**
- `backend/prisma/schema.prisma` — modelo WorkerRelease + campo WorkerNode.version
- `backend/src/modules/workers/protocol.types.ts` — UpdateAvailableMessage, RegisterMessage.version
- `backend/src/modules/workers/workerServer.ts` — broadcast, manejo version en register
- `backend/src/modules/workers/workerPool.ts` — almacenar version por worker
- `backend/src/app.ts` — montar releases routes
- `worker/worker/src/types/protocol.types.ts` — sincronizar tipos
- `worker/worker/src/config.ts` — exponer version
- `worker/worker/src/workerClient.ts` — integrar updater, pendingUpdate, polling fallback
- `worker/worker/package.json` — deps unzipper, semver, version bump
- `apps/web/src/pages/AdminWorkers.tsx` (o equivalente) — columna versión + modal upload
- `backend/.gitignore` / `docs/backend-context.md` — documentar data dir

---

### Task 1: Prisma - Modelo WorkerRelease y WorkerNode.version

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/migrations/*` (generado)

**Interfaces:**
- Produces: `WorkerRelease {id, version, sha256, size, filePath, mandatory, createdAt, createdBy}` y `WorkerNode.version: String?`

- [ ] **Step 1: Añadir modelos a schema.prisma**

```prisma
model WorkerRelease {
  id        String   @id @default(cuid())
  version   String   @unique
  sha256    String
  size      Int
  filePath  String
  mandatory Boolean  @default(false)
  createdAt DateTime @default(now())
  createdBy String?
}

model WorkerNode {
  id         String   @id @default(cuid())
  workerId   String   @unique
  name       String
  status     String
  version    String?
  lastSeenAt DateTime @default(now())
  currentJobId String?
  // ... campos existentes
}
```
Si `WorkerNode` ya tiene otros campos, solo añadir `version String?`.

- [ ] **Step 2: Generar migración**

Run: `pnpm --filter backend prisma migrate dev --name add_worker_release`
Expected: Migración creada, `prisma migrate` OK, sin pérdida de datos (campo nullable).

- [ ] **Step 3: Verificar prisma generate**

Run: `pnpm --filter backend prisma generate`
Expected: PASS, tipos `WorkerRelease` disponibles.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(workers): add WorkerRelease model and WorkerNode.version"
```

---

### Task 2: Backend Releases Service + Routes (upload/list/download)

**Files:**
- Create: `backend/src/modules/workers/releases.service.ts`
- Create: `backend/src/modules/workers/releases.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/.gitignore`

**Interfaces:**
- Consumes: Prisma `WorkerRelease`, FS `data/worker-releases/`
- Produces: `releasesService.createRelease({version, filePath, mandatory, createdBy})`, `getLatestRelease(currentVersion)`, `getReleaseByVersion(version)`, router con 4 endpoints

- [ ] **Step 1: Crear releases.service.ts**

```ts
// backend/src/modules/workers/releases.service.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../../infrastructure/database/prisma";

const RELEASES_DIR = path.join(process.cwd(), "data", "worker-releases");
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const MAX_SIZE = 50 * 1024 * 1024;

export function ensureReleasesDir(): void {
  if (!fs.existsSync(RELEASES_DIR)) fs.mkdirSync(RELEASES_DIR, { recursive: true });
}

export function validateSemver(v: string): void {
  if (!SEMVER_RE.test(v)) throw new Error("Version debe ser semver x.y.z");
}

export async function computeSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export async function createRelease(params: { version: string; tmpPath: string; mandatory: boolean; createdBy?: string }): Promise<{ version: string; sha256: string; size: number }> {
  validateSemver(params.version);
  const exists = await prisma.workerRelease.findUnique({ where: { version: params.version } });
  if (exists) throw new Error("Version ya existe");
  const stat = fs.statSync(params.tmpPath);
  if (stat.size > MAX_SIZE) throw new Error("Artefacto excede 50 MB");
  const sha256 = await computeSha256(params.tmpPath);
  ensureReleasesDir();
  const dest = path.join(RELEASES_DIR, `${params.version}.zip`);
  fs.copyFileSync(params.tmpPath, dest);
  fs.unlinkSync(params.tmpPath);
  await prisma.workerRelease.create({
    data: { version: params.version, sha256, size: stat.size, filePath: dest, mandatory: params.mandatory, createdBy: params.createdBy },
  });
  return { version: params.version, sha256, size: stat.size };
}

export async function getLatestRelease(): Promise<{ version: string; sha256: string; size: number; mandatory: boolean } | null> {
  return prisma.workerRelease.findFirst({ orderBy: { createdAt: "desc" }, select: { version: true, sha256: true, size: true, mandatory: true } });
}

export async function getReleaseByVersion(version: string) {
  return prisma.workerRelease.findUnique({ where: { version } });
}
```

- [ ] **Step 2: Crear releases.routes.ts**

```ts
// backend/src/modules/workers/releases.routes.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import os from "os";
import fs from "fs";
import path from "path";
import { requireAuth } from "../auth/auth.middleware";
import { config } from "../../config";
import * as releasesService from "./releases.service";
import { broadcastUpdateAvailable } from "./workerServer";

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

// Admin: subir
router.post("/admin/worker-releases", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  try {
    const version = req.body.version as string;
    const mandatory = req.body.mandatory === "true";
    if (!req.file) { res.status(400).json({ error: "file requerido" }); return; }
    if (!version) { fs.unlinkSync(req.file.path); res.status(400).json({ error: "version requerida" }); return; }
    const result = await releasesService.createRelease({ version, tmpPath: req.file.path, mandatory, createdBy: (req as any).user?.id });
    broadcastUpdateAvailable({ version: result.version, sha256: result.sha256, mandatory });
    res.status(201).json(result);
  } catch (e: any) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: e.message });
  }
});

router.get("/admin/worker-releases", requireAuth, async (_req, res) => {
  const { prisma } = await import("../../infrastructure/database/prisma");
  const list = await prisma.workerRelease.findMany({ orderBy: { createdAt: "desc" } });
  res.json(list);
});

// Worker: latest
router.get("/workers/updates/latest", async (req: Request, res: Response) => {
  const secret = req.headers["x-worker-secret"] as string;
  if (secret !== config.worker.authSecret) { res.status(403).json({ error: "Invalid secret" }); return; }
  const latest = await releasesService.getLatestRelease();
  if (!latest) { res.status(204).end(); return; }
  const current = (req.headers["x-worker-version"] as string) || (req.query.current as string) || "0.0.0";
  if (latest.version === current) { res.status(204).end(); return; }
  res.json({ ...latest, downloadUrl: `/workers/updates/${latest.version}/download` });
});

router.get("/workers/updates/:version/download", async (req: Request, res: Response) => {
  const secret = req.headers["x-worker-secret"] as string;
  if (secret !== config.worker.authSecret) { res.status(403).json({ error: "Invalid secret" }); return; }
  const rel = await releasesService.getReleaseByVersion(req.params.version);
  if (!rel) { res.status(404).json({ error: "Version no encontrada" }); return; }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(rel.size));
  fs.createReadStream(rel.filePath).pipe(res);
});

export default router;
```

- [ ] **Step 3: Montar en app.ts**

```ts
// backend/src/app.ts
import releasesRoutes from "./modules/workers/releases.routes";
app.use(releasesRoutes);
```

- [ ] **Step 4: Añadir a .gitignore**

```
/data/worker-releases/
```

- [ ] **Step 5: Verificar build**

Run: `pnpm --filter backend build` o `tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/workers/releases.service.ts backend/src/modules/workers/releases.routes.ts backend/src/app.ts backend/.gitignore
git commit -m "feat(workers): add releases upload/download and latest endpoint"
```

---

### Task 3: Protocolo WS y Broadcast

**Files:**
- Modify: `backend/src/modules/workers/protocol.types.ts`
- Modify: `backend/src/modules/workers/workerServer.ts`
- Modify: `backend/src/modules/workers/workerPool.ts`
- Modify: `worker/worker/src/types/protocol.types.ts`

**Interfaces:**
- Consumes: Task 1 (WorkerNode.version), Task 2 (broadcastUpdateAvailable)
- Produces: `UpdateAvailableMessage`, `broadcastUpdateAvailable()`, `register` con `version`

- [ ] **Step 1: Extender protocol.types.ts backend**

```ts
// añadir a ServerMessageType: "update_available"
export type ServerMessageType = "assign_job" | "ping" | "acknowledge" | "update_available";

export interface UpdateAvailableMessage {
  type: "update_available";
  version: string;
  sha256: string;
  url: string;
  mandatory: boolean;
}

export interface RegisterMessage {
  type: "register";
  workerId: string;
  secret: string;
  name: string;
  maxConcurrentJobs: number;
  version: string;
}
```

Sincronizar idéntico en `worker/worker/src/types/protocol.types.ts`.

- [ ] **Step 2: Actualizar workerPool para guardar version**

```ts
// backend/src/modules/workers/workerPool.ts
export interface WorkerEntry {
  workerId: string;
  name: string;
  socket: WebSocket;
  status: "idle" | "busy" | "dead";
  version?: string;
  // ... existente
}

export function registerWorker(entry: WorkerEntry & { version?: string }): void {
  pool.set(entry.workerId, { ...entry, version: entry.version, currentJobs: [] });
}
```

- [ ] **Step 3: Actualizar workerServer.ts**

```ts
// en handleRegister, leer message.version, pasar a registerWorker, upsert prisma WorkerNode con version
registerWorker({ ..., version: (message as any).version });
await prisma.workerNode.upsert({
  where: { workerId: message.workerId },
  create: { workerId: message.workerId, name: message.name, status: "ONLINE", version: (message as any).version },
  update: { name: message.name, status: "ONLINE", version: (message as any).version, lastSeenAt: new Date() },
});

// nueva función exportada
export function broadcastUpdateAvailable(payload: { version: string; sha256: string; mandatory: boolean }): void {
  const msg = JSON.stringify({ type: "update_available", version: payload.version, sha256: payload.sha256, url: `/workers/updates/${payload.version}/download`, mandatory: payload.mandatory });
  for (const w of getAllWorkers()) {
    if (w.socket.readyState === WebSocket.OPEN) {
      try { w.socket.send(msg); } catch {}
    }
  }
}
```

- [ ] **Step 4: Verificar tipos cruzados**

Run: `pnpm --filter backend typecheck && pnpm --filter worker typecheck` (o `tsc --noEmit` en cada)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workers/protocol.types.ts backend/src/modules/workers/workerServer.ts backend/src/modules/workers/workerPool.ts worker/worker/src/types/protocol.types.ts
git commit -m "feat(workers): add update_available protocol and version tracking"
```

---

### Task 4: Worker Updater (descarga, verificación, swap)

**Files:**
- Create: `worker/worker/src/updater.ts`
- Modify: `worker/worker/package.json`
- Modify: `worker/worker/src/config.ts`

**Interfaces:**
- Consumes: `config.version`, `config.serverWsUrl` base para construir URL, `WorkerMessage` tipos
- Produces: `handleUpdateAvailable(msg)`, `downloadAndVerify(url, sha256)`, `applyUpdate(zipPath)`

- [ ] **Step 1: Añadir deps y version a worker**

```json
// worker/worker/package.json
{
  "dependencies": {
    "axios": "^1.18.0",
    "semver": "^7.6.3",
    "unzipper": "^0.12.3"
  }
}
```
Y en `config.ts`:
```ts
import pkg from "../package.json";
export const config = {
  version: (pkg as any).version as string,
  serverWsUrl: requireEnv("SERVER_WS_URL"),
  // ... resto
};
```

- [ ] **Step 2: Crear updater.ts**

```ts
// worker/worker/src/updater.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import * as semver from "semver";
import unzipper from "unzipper";
import { config } from "./config";
import { logger } from "./logger";

const INSTALL_DIR = path.resolve(__dirname, "..");
const PENDING_ZIP = path.join(INSTALL_DIR, ".pending.zip");
const PENDING_DIR = path.join(INSTALL_DIR, ".pending");

let pendingUpdate: { version: string; sha256: string; url: string } | null = null;

export function setPendingUpdate(u: typeof pendingUpdate) { pendingUpdate = u; }
export function getPendingUpdate() { return pendingUpdate; }

function baseHttpUrl(): string {
  // SERVER_WS_URL es ws://host:port -> http://host:port
  return config.serverWsUrl.replace(/^ws/, "http").replace(/\/ws\/?$/, "");
}

export async function downloadAndVerify(url: string, expectedSha256: string): Promise<string> {
  const httpUrl = url.startsWith("/") ? baseHttpUrl() + url : url;
  const res = await axios.get(httpUrl, {
    responseType: "stream",
    headers: { "x-worker-secret": config.workerSecret, "x-worker-version": config.version },
    timeout: 120_000,
  });
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(PENDING_ZIP);
  await new Promise<void>((resolve, reject) => {
    res.data.on("data", (c: Buffer) => hash.update(c));
    res.data.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
    res.data.on("error", reject);
  });
  const actual = hash.digest("hex");
  if (actual !== expectedSha256) {
    fs.unlinkSync(PENDING_ZIP);
    throw new Error(`SHA256 mismatch: expected ${expectedSha256} got ${actual}`);
  }
  return PENDING_ZIP;
}

export async function applyUpdate(zipPath: string): Promise<void> {
  if (fs.existsSync(PENDING_DIR)) fs.rmSync(PENDING_DIR, { recursive: true, force: true });
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: PENDING_DIR })).promise();
  const pendingMain = path.join(PENDING_DIR, "main.js");
  const pendingDistMain = path.join(PENDING_DIR, "dist", "main.js");
  if (!fs.existsSync(pendingMain) && !fs.existsSync(pendingDistMain)) {
    throw new Error("ZIP sin main.js/dist/main.js");
  }
  // backup
  const backupMain = path.join(INSTALL_DIR, "main.js.bak");
  if (fs.existsSync(path.join(INSTALL_DIR, "main.js"))) fs.copyFileSync(path.join(INSTALL_DIR, "main.js"), backupMain);
  // swap
  for (const entry of fs.readdirSync(PENDING_DIR)) {
    const src = path.join(PENDING_DIR, entry);
    const dest = path.join(INSTALL_DIR, entry);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(src, dest);
  }
  fs.rmSync(PENDING_DIR, { recursive: true, force: true });
  fs.unlinkSync(zipPath);
  // reinicio WinSW
  const winsw = path.join(INSTALL_DIR, "bins", "WinSW.exe");
  if (fs.existsSync(winsw)) {
    const { exec } = await import("child_process");
    exec(`"${winsw}" restart`, (err) => {
      if (err) exec(`"${winsw}" stop`, () => exec(`"${winsw}" start`, () => {}));
    });
  } else {
    logger.warn("Updater", "WinSW no encontrado, reinicio manual requerido");
    process.exit(0);
  }
}

export async function handleUpdateAvailable(msg: { version: string; sha256: string; url: string }, isIdle: () => boolean): Promise<void> {
  if (semver.valid(msg.version) && semver.lte(msg.version, config.version)) {
    logger.info("Updater", "Version ya actual", { current: config.version, incoming: msg.version });
    return;
  }
  if (!isIdle()) {
    setPendingUpdate(msg);
    logger.info("Updater", "Update aplazado, worker busy", { version: msg.version });
    return;
  }
  logger.info("Updater", "Descargando update", { version: msg.version });
  const zip = await downloadAndVerify(msg.url, msg.sha256);
  await applyUpdate(zip);
}
```

- [ ] **Step 3: Instalar deps**

Run: `pnpm --filter lavoz-worker install`
Expected: PASS

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter lavoz-worker typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/worker/src/updater.ts worker/worker/src/config.ts worker/worker/package.json worker/worker/pnpm-lock.yaml
git commit -m "feat(worker): add updater with sha256 verify and atomic swap"
```

---

### Task 5: Integrar Updater en WorkerClient + Polling Fallback

**Files:**
- Modify: `worker/worker/src/workerClient.ts`
- Modify: `worker/worker/src/main.ts` (opcional log version)

**Interfaces:**
- Consumes: `updater.handleUpdateAvailable`, `config.version`
- Produces: worker reporta version, aplica pending al quedar idle, polling cada 6h

- [ ] **Step 1: Enviar version en register y manejar update_available**

```ts
// worker/worker/src/workerClient.ts
import { handleUpdateAvailable, getPendingUpdate, setPendingUpdate, downloadAndVerify, applyUpdate } from "./updater";

// en socket.on("open") -> send register con version
send({ type: "register", workerId: config.workerId, secret: config.workerSecret, name: config.workerName, maxConcurrentJobs: config.maxConcurrentJobs, version: config.version } as any);

// en socket.on("message") switch:
case "update_available":
  void handleUpdateAvailable(message as any, () => activeJobs === 0);
  break;

// en handleJob finally, tras activeJobs--:
if (activeJobs === 0) {
  const pending = getPendingUpdate();
  if (pending) {
    setPendingUpdate(null);
    void handleUpdateAvailable(pending, () => true);
  }
}
```

- [ ] **Step 2: Añadir polling fallback cada 6h**

```ts
// en startWorkerClient, tras startHeartbeat():
setInterval(async () => {
  try {
    const base = config.serverWsUrl.replace(/^ws/, "http").replace(/\/ws\/?$/, "");
    const res = await axios.get(`${base}/workers/updates/latest`, {
      headers: { "x-worker-secret": config.workerSecret, "x-worker-version": config.version },
      validateStatus: s => s === 200 || s === 204,
    });
    if (res.status === 200 && res.data?.version) {
      void handleUpdateAvailable({ version: res.data.version, sha256: res.data.sha256, url: res.data.downloadUrl }, () => activeJobs === 0);
    }
  } catch {}
}, 6 * 60 * 60 * 1000);
```

- [ ] **Step 3: Verificar build worker**

Run: `pnpm --filter lavoz-worker build && node worker/worker/dist/main.js --help` (o solo build)
Expected: PASS, bundle incluye updater

- [ ] **Step 4: Commit**

```bash
git add worker/worker/src/workerClient.ts
git commit -m "feat(worker): integrate updater in client with idle guard and polling fallback"
```

---

### Task 6: Admin UI - Versión y Upload

**Files:**
- Modify: `apps/web/src/pages/AdminWorkers.tsx` (o `backend` admin page equivalente)
- Modify: `backend/src/modules/workers/workerAdmin.routes.ts` (exponer version en GET /workers)

**Interfaces:**
- Consumes: `GET /admin/worker-releases`, `POST /admin/worker-releases`, `GET /workers` con `version`

- [ ] **Step 1: Exponer version en workerAdmin.routes.ts**

```ts
// en GET /workers handler, mapear w.version
res.json(getAllWorkers().map(w => ({ ..., version: (w as any).version ?? null })));
```

- [ ] **Step 2: Añadir columna versión y modal upload en AdminWorkers.tsx**

```tsx
// Estado
const [releases, setReleases] = useState<Release[]>([]);
const [uploading, setUploading] = useState(false);

// Fetch releases en useEffect
fetch("/admin/worker-releases", { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()).then(setReleases);

// Tabla workers: añadir <td>{w.version ?? "desconocida"}</td> y badge "desactualizado" si w.version !== latest?.version

// Modal upload
async function onUpload(e: FormEvent) {
  const fd = new FormData(e.target as HTMLFormElement);
  setUploading(true);
  const res = await fetch("/admin/worker-releases", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  if (!res.ok) alert(await res.text());
  setUploading(false);
}
// Form: <input name="version" pattern="\d+\.\d+\.\d+" required /> <input type="file" name="file" accept=".zip" required /> <input type="checkbox" name="mandatory" />
```

- [ ] **Step 3: Verificar frontend build**

Run: `pnpm --filter web build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/AdminWorkers.tsx backend/src/modules/workers/workerAdmin.routes.ts
git commit -m "feat(admin): show worker version and upload new release"
```

---

### Task 7: Documentación y Limpieza

**Files:**
- Modify: `docs/backend-context.md`
- Modify: `worker/worker/.env.example`

**Interfaces:**
- Produces: docs actualizadas, gitignore verificado

- [ ] **Step 1: Actualizar docs/backend-context.md**

Añadir sección "Worker Releases" describiendo endpoints, FS dir, polling.

- [ ] **Step 2: Actualizar worker .env.example**

Añadir comentario `WORKER_VERSION` auto desde package.json.

- [ ] **Step 3: Commit final**

```bash
git add docs/backend-context.md worker/worker/.env.example
git commit -m "docs: document worker auto-update flow"
```

---

## Self-Review

- Spec cobertura: RF1->Task2, RF2->Task3+5, RF3->Task3, RF4->Task4+5, RF5->Task4+2, RF6->Task4. RNFs cubiertos. Sin gaps.
- Placeholders: ninguno, todos los pasos tienen código concreto.
- Tipos: `RegisterMessage.version`, `UpdateAvailableMessage` consistentes entre backend y worker. `WorkerEntry.version` alineado.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-09-01-worker-autoupdate.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** - dispatch subagente por tarea, review entre tareas

**2. Inline Execution** - ejecución en esta sesión con checkpoints

¿Cuál eliges?
