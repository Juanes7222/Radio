import { Router, type Request, type Response } from "express";
import multer from "multer";
import os from "os";
import fs from "fs";
import { config } from "../../config";
import { requireAuth } from "../auth/auth.middleware";
import * as releasesService from "./releases.service";
import { broadcastUpdateAvailable } from "./workerServer";

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

// Admin: upload new release - soporta /admin y /admin-api para compatibilidad con nginx legacy
router.post(
  ["/admin/worker-releases", "/admin-api/worker-releases"],
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const version = (req.body.version as string | undefined)?.trim() || undefined;
      const mandatory = req.body.mandatory === "true" || req.body.mandatory === true;
      if (!req.file) {
        res.status(400).json({ error: "file requerido" });
        return;
      }
      const createdBy = (req as unknown as { user?: { id?: string } }).user?.id;
      const result = await releasesService.createRelease({
        version,
        tmpPath: req.file.path,
        mandatory,
        createdBy,
      });
      broadcastUpdateAvailable({ version: result.version, sha256: result.sha256, mandatory });
      res.status(201).json(result);
    } catch (e: unknown) {
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      const message = e instanceof Error ? e.message : String(e);
      const status = message.includes("ya existe") ? 409 : 400;
      res.status(status).json({ error: message });
    }
  }
);

router.get(["/admin/worker-releases", "/admin-api/worker-releases"], requireAuth, async (_req: Request, res: Response) => {
  const { prisma } = await import("../../infrastructure/database/prisma");
  const list = await prisma.workerRelease.findMany({ orderBy: { createdAt: "desc" } });
  res.json(list);
});

// Worker: latest
async function handleLatest(req: Request, res: Response): Promise<void> {
  const secret = req.headers["x-worker-secret"] as string | undefined;
  if (secret !== config.worker.authSecret) {
    res.status(403).json({ error: "Invalid secret" });
    return;
  }
  const latest = await releasesService.getLatestRelease();
  if (!latest) {
    res.status(204).end();
    return;
  }
  const current =
    (req.headers["x-worker-version"] as string | undefined) ??
    (req.query.current as string | undefined) ??
    "0.0.0";
  if (latest.version === current) {
    res.status(204).end();
    return;
  }
  res.json({ ...latest, downloadUrl: `/workers/updates/${latest.version}/download` });
}

async function handleDownload(req: Request, res: Response): Promise<void> {
  const secret = req.headers["x-worker-secret"] as string | undefined;
  if (secret !== config.worker.authSecret) {
    res.status(403).json({ error: "Invalid secret" });
    return;
  }
  const rel = await releasesService.getReleaseByVersion(req.params.version as string);
  if (!rel) {
    res.status(404).json({ error: "Version no encontrada" });
    return;
  }
  if (!fs.existsSync(rel.filePath)) {
    res.status(404).json({ error: "Archivo no encontrado en servidor" });
    return;
  }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(rel.size));
  res.setHeader("Content-Disposition", `attachment; filename="${rel.version}.zip"`);
  fs.createReadStream(rel.filePath).pipe(res);
}

router.get("/workers/updates/latest", handleLatest);
router.get("/workers/updates/:version/download", handleDownload);
// Compat: workers antiguos con bug baseHttpUrl duplicaban /admin-api/workers prefix
router.get("/admin-api/workers/workers/updates/latest", handleLatest);
router.get("/admin-api/workers/workers/updates/:version/download", handleDownload);

export default router;
