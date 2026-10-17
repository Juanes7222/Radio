import { Router, type Request, type Response } from "express";
import fs from "fs/promises";
import multer from "multer";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { AppError } from "../../shared/errors/app-error";
import { asyncHandler } from "../../shared/errors/async-handler";
import { ensureDir } from "../../shared/storage/localStorage";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import {
  PROGRAM_ASSET_MAX_BYTES,
  PROGRAM_AUDIO_MIME_TYPES,
} from "../programs/program.constants";
import {
  clearBumperAsset,
  createBumper,
  deleteBumper,
  listBumpers,
  reconcileBumper,
  setBumperAsset,
  updateBumper,
} from "./bumper.service";
import { BUMPER_PERMISSION, isBumperAssetKind, type BumperAssetKind } from "./bumper.constants";

const router = Router();

router.use(requireAuth, requirePermission(BUMPER_PERMISSION));

/**
 * A bumper can be as long as a whole song, so it goes to disk instead of memory:
 * the same reason the program episodes do.
 */
const assetUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), `radio-bumper-${randomUUID()}`);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname).slice(0, 8) || ".mp3";
      cb(null, `bumper${extension}`);
    },
  }),
  limits: { fileSize: PROGRAM_ASSET_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = (PROGRAM_AUDIO_MIME_TYPES as readonly string[]).includes(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error(`Tipo de audio no permitido: ${file.mimetype}`));
  },
});

function parseKind(value: string): BumperAssetKind {
  if (!isBumperAssetKind(value)) {
    throw new AppError(400, `Bumper desconocido: "${value}". Usa "intro" u "outro".`);
  }
  return value;
}

function parseLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, "El nombre del programa es obligatorio.");
  }
  return value;
}

function parsePlaylistId(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw new AppError(400, "La playlist debe ser un número.");
  }
  return parsed;
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new AppError(400, `El campo "${field}" debe ser true o false.`);
  }
  return value;
}

/** Removes the scratch directory multer created for one upload. */
async function removeUploadDir(uploadedPath: string): Promise<void> {
  const dir = path.dirname(uploadedPath);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * GET /admin-api/bumpers
 * Every bumper with the current state of its playlist.
 */
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ bumpers: await listBumpers() });
  })
);

/**
 * POST /admin-api/bumpers
 * Hooks an intro and an outro to a playlist. Rejected when the playlist belongs to
 * a Program or to the general content of the station.
 */
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const glued = parseOptionalBoolean(body.glued, "glued");
    const bumper = await createBumper({
      label: parseLabel(body.label),
      playlistId: parsePlaylistId(body.playlistId),
      ...(glued === undefined ? {} : { glued }),
    });
    res.status(201).json(bumper);
  })
);

/**
 * PUT /admin-api/bumpers/:id
 * Renames the bumper, toggles it, changes the playlist it is attached to, or
 * switches between a glued block and separate tracks.
 */
router.put(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const enabled = parseOptionalBoolean(body.enabled, "enabled");
    const glued = parseOptionalBoolean(body.glued, "glued");
    res.json(
      await updateBumper(String(req.params.id), {
        ...(body.label === undefined ? {} : { label: parseLabel(body.label) }),
        ...(body.playlistId === undefined
          ? {}
          : { playlistId: parsePlaylistId(body.playlistId) }),
        ...(enabled === undefined ? {} : { enabled }),
        ...(glued === undefined ? {} : { glued }),
      })
    );
  })
);

/**
 * DELETE /admin-api/bumpers/:id
 * Puts the playlist back the way it was and detaches the bumpers. The media is
 * left in the station library on purpose.
 */
router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    await deleteBumper(String(req.params.id));
    res.status(204).end();
  })
);

/**
 * POST /admin-api/bumpers/:id/assets/:kind
 * Uploads the intro or the outro, pushes it to the station library and reconciles.
 */
router.post(
  "/:id/assets/:kind",
  assetUpload.single("audio"),
  asyncHandler(async (req: Request, res: Response) => {
    const kind = parseKind(String(req.params.kind));
    const uploaded = req.file;
    if (!uploaded) {
      throw new AppError(400, "Falta el archivo de audio.");
    }

    try {
      res.json(
        await setBumperAsset(String(req.params.id), kind, uploaded.path, uploaded.originalname)
      );
    } finally {
      await removeUploadDir(uploaded.path);
    }
  })
);

/**
 * DELETE /admin-api/bumpers/:id/assets/:kind
 * Removes one side of the bumper.
 */
router.delete(
  "/:id/assets/:kind",
  asyncHandler(async (req: Request, res: Response) => {
    const kind = parseKind(String(req.params.kind));
    res.json(await clearBumperAsset(String(req.params.id), kind));
  })
);

/**
 * POST /admin-api/bumpers/:id/reconcile
 * Runs the reconciliation by hand and returns what it did.
 */
router.post(
  "/:id/reconcile",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ result: await reconcileBumper(String(req.params.id)) });
  })
);

export default router;