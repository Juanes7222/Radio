import { Router, type Request } from "express";
import fs from "fs";
import multer from "multer";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { config } from "../../config";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";
import { ensureDir } from "../../shared/storage/localStorage";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { getPlaylistDetail } from "../rotation/azuracastPlaylist.service";
import {
  ALLOWED_IMAGE_MIME_SET,
  PROGRAM_ART_MAX_BYTES,
  PROGRAM_ASSET_MAX_BYTES,
  PROGRAM_AUDIO_MIME_TYPES,
  PROGRAM_EPISODE_MAX_BYTES,
  PROGRAM_PERMISSION,
} from "./program.constants";
import {
  clearProgramAsset,
  clearProgramArtwork,
  createProgram,
  deleteProgram,
  findProgramRow,
  getProgram,
  listEpisodes,
  listPrograms,
  setProgramArtwork,
  setProgramAsset,
  updateProgram,
} from "./program.service";
import {
  deleteEpisode,
  getEpisode,
  markEpisodePlayed,
  markEpisodeQueued,
  prepareEpisode,
  publishEpisode,
  syncProgram,
} from "./program.episode.service";
import { requireComposedEpisode } from "./program.temp";
import {
  findFreeSlot,
  isWindowAvailable,
  minutesToClock,
  clockToMinutes,
} from "./program.slotFinder.service";
import {
  optionalBoolean,
  optionalFloat,
  optionalInteger,
  parseEpisodeBody,
  parseProgramCreateBody,
  parseProgramUpdateBody,
} from "./program.validation";
import type { ProgramStreamWindow } from "@radio/types";

const router = Router();

const AUDIO_MIME_SET: ReadonlySet<string> = new Set(PROGRAM_AUDIO_MIME_TYPES);

function isAllowedAudio(mimeType: string): boolean {
  return AUDIO_MIME_SET.has(mimeType);
}

/**
 * Episodes land on disk instead of memory: a long recording is hundreds of MB.
 * The image stays in memory because it is small and gets optimized at once.
 */
const episodeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      if (file.fieldname !== "file") {
        cb(null, os.tmpdir());
        return;
      }
      const dir = path.join(config.programs.tempDir, `upload-${randomUUID()}`);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      if (file.fieldname !== "file") {
        cb(null, `art-${randomUUID()}`);
        return;
      }
      const extension = path.extname(file.originalname).slice(0, 8) || ".mp3";
      cb(null, `source${extension}`);
    },
  }),
  limits: { fileSize: PROGRAM_EPISODE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "image") {
      if (ALLOWED_IMAGE_MIME_SET.has(file.mimetype)) cb(null, true);
      else cb(new Error("Tipo de imagen no permitido. Usa JPG, PNG, WebP, GIF o AVIF."));
      return;
    }
    if (isAllowedAudio(file.mimetype)) cb(null, true);
    else cb(new Error(`Tipo de audio no permitido: ${file.mimetype}`));
  },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROGRAM_ART_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_SET.has(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de imagen no permitido. Usa JPG, PNG, WebP, GIF o AVIF."));
  },
});

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROGRAM_ASSET_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedAudio(file.mimetype)) cb(null, true);
    else cb(new Error(`Tipo de audio no permitido: ${file.mimetype}`));
  },
});

/** Removes the scratch directory multer created for one upload. */
async function removeUploadDir(uploadedPath: string): Promise<void> {
  const dir = path.dirname(uploadedPath);
  if (!dir.includes(config.programs.tempDir)) return;
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

function requireAssetKind(value: string): "intro" | "outro" {
  if (value === "intro" || value === "outro") return value;
  throw new AppError(400, "El recurso debe ser 'intro' u 'outro'.");
}

interface EpisodeUploads {
  file?: Express.Multer.File[];
  image?: Express.Multer.File[];
}

function pickFile(files: EpisodeUploads, field: "file" | "image"): Express.Multer.File | null {
  return files[field]?.[0] ?? null;
}

function getImage(req: Request): { buffer: Buffer; mimetype: string } {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new AppError(400, "No se recibió la imagen.");
  return { buffer: file.buffer, mimetype: file.mimetype };
}

function getAssetFile(req: Request): { buffer: Buffer; originalname: string } {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new AppError(400, "No se recibió el archivo de audio.");
  return { buffer: file.buffer, originalname: file.originalname };
}

router.use(requireAuth, requirePermission(PROGRAM_PERMISSION));

/** GET /admin-api/programs */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ programs: await listPrograms() });
  })
);

/** POST /admin-api/programs */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createProgram(parseProgramCreateBody(req.body)));
  })
);

/** POST /admin-api/programs/episodes/:episodeId/played */
router.post(
  "/episodes/:episodeId/played",
  asyncHandler(async (req, res) => {
    res.json(await markEpisodePlayed(String(req.params.episodeId)));
  })
);

/** POST /admin-api/programs/episodes/:episodeId/queued */
router.post(
  "/episodes/:episodeId/queued",
  asyncHandler(async (req, res) => {
    res.json(await markEpisodeQueued(String(req.params.episodeId)));
  })
);

/** DELETE /admin-api/programs/episodes/:episodeId */
router.delete(
  "/episodes/:episodeId",
  asyncHandler(async (req, res) => {
    const keepLibraryFile = optionalBoolean(req.query.keepFile, "keepFile") === true;
    await deleteEpisode(String(req.params.episodeId), keepLibraryFile);
    res.status(204).end();
  })
);

/** GET /admin-api/programs/:id */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await getProgram(String(req.params.id)));
  })
);

/** PUT /admin-api/programs/:id */
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = parseProgramUpdateBody(req.body);
    const { name, ...rest } = input as { name?: string } & Record<string, unknown>;
    res.json(await updateProgram(String(req.params.id), { ...rest, ...(name ? { name } : {}) }));
  })
);

/** DELETE /admin-api/programs/:id */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteProgram(String(req.params.id));
    res.status(204).end();
  })
);

/** POST /admin-api/programs/:id/artwork */
router.post(
  "/:id/artwork",
  imageUpload.single("image"),
  asyncHandler(async (req, res) => {
    res.json(await setProgramArtwork(String(req.params.id), getImage(req)));
  })
);

/** DELETE /admin-api/programs/:id/artwork */
router.delete(
  "/:id/artwork",
  asyncHandler(async (req, res) => {
    res.json(await clearProgramArtwork(String(req.params.id)));
  })
);

/** POST /admin-api/programs/:id/assets/:kind */
router.post(
  "/:id/assets/:kind",
  assetUpload.single("audio"),
  asyncHandler(async (req, res) => {
    const kind = requireAssetKind(String(req.params.kind));
    res.json(await setProgramAsset(String(req.params.id), kind, getAssetFile(req)));
  })
);

/** DELETE /admin-api/programs/:id/assets/:kind */
router.delete(
  "/:id/assets/:kind",
  asyncHandler(async (req, res) => {
    const kind = requireAssetKind(String(req.params.kind));
    res.json(await clearProgramAsset(String(req.params.id), kind));
  })
);

/** GET /admin-api/programs/:id/episodes */
router.get(
  "/:id/episodes",
  asyncHandler(async (req, res) => {
    const limit = optionalInteger(req.query.limit, "El límite", { min: 1, max: 500 });
    await findProgramRow(String(req.params.id));
    res.json({ episodes: await listEpisodes(String(req.params.id), { limit }) });
  })
);

/**
 * POST /admin-api/programs/:id/episodes/prepare
 * multipart: file (audio), image (optional), title, normalizeLoudness,
 * reduceNoise, dayIndex, startTime
 *
 * Composes the episode and leaves it on the server without touching AzuraCast.
 * The admin previews the result and publishes it in a second call.
 */
router.post(
  "/:id/episodes/prepare",
  episodeUpload,
  asyncHandler(async (req, res) => {
    const files = ((req as Request & { files?: EpisodeUploads }).files ?? {}) as EpisodeUploads;
    const audio = pickFile(files, "file");
    if (!audio) throw new AppError(400, "No se recibió el archivo de audio.");

    const image = pickFile(files, "image");
    const audioPath = audio.path;

    try {
      const input = parseEpisodeBody(req.body);
      const result = await prepareEpisode(
        String(req.params.id),
        input,
        { tempPath: audioPath, originalName: audio.originalname },
        image ? { buffer: fs.readFileSync(image.path), mimetype: image.mimetype } : null
      );
      res.status(201).json(result);
    } finally {
      await fs.promises.rm(audioPath, { force: true }).catch(() => undefined);
      if (image) await fs.promises.rm(image.path, { force: true }).catch(() => undefined);
      await removeUploadDir(audioPath);
    }
  })
);

/**
 * POST /admin-api/programs/episodes/:episodeId/publish
 * Sends an already composed episode to AzuraCast, writes its metadata and
 * reserves the emission window.
 */
router.post(
  "/episodes/:episodeId/publish",
  asyncHandler(async (req, res) => {
    const input = parseEpisodeBody(req.body);
    res.json(await publishEpisode(String(req.params.episodeId), input));
  })
);

/**
 * GET /admin-api/programs/episodes/:episodeId/preview
 * Streams the composed episode so the admin can listen before publishing.
 */
router.get(
  "/episodes/:episodeId/preview",
  asyncHandler(async (req, res) => {
    const episodeId = String(req.params.episodeId);
    await getEpisode(episodeId);
    const filePath = await requireComposedEpisode(episodeId);
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(filePath);
  })
);

/** GET /admin-api/programs/:id/schedule */
router.get(
  "/:id/schedule",
  asyncHandler(async (req, res) => {
    const program = await findProgramRow(String(req.params.id));
    const detail = await getPlaylistDetail(program.playlistId);

    const windows: ProgramStreamWindow[] = (detail.schedule_items ?? []).flatMap(
      (item) =>
        (item.days ?? []).map((day) => ({
          id: item.id ?? 0,
          dayIndex: day,
          startTime: minutesToClock(item.start_time),
          endTime: minutesToClock(item.end_time),
        }))
    );

    res.json({ windows });
  })
);

/**
 * GET /admin-api/programs/:id/slot?durationSec=1800
 * Earliest window able to host an episode without colliding with the station
 * schedule. Answers 409 with the reason when nothing is free.
 */
router.get(
  "/:id/slot",
  asyncHandler(async (req, res) => {
    const program = await findProgramRow(String(req.params.id));
    const durationSec = optionalFloat(req.query.durationSec, "La duración", {
      min: 1,
      max: 24 * 60 * 60,
    });

    const found = await findFreeSlot({
      playlistId: program.playlistId,
      daysMask: program.daysMask,
      airStartMinute: program.airStartMinute,
      airEndMinute: program.airEndMinute,
      daysAhead: program.daysAhead,
      leadMinutes: program.leadMinutes,
      bufferMinutes: program.bufferMinutes,
      durationSec: durationSec ?? 30 * 60,
    });

    if (!found.ok) {
      throw new AppError(409, found.reason);
    }

    res.json({
      slot: {
        dayIndex: found.slot.dayIndex,
        dayKey: found.slot.dayKey,
        startTime: minutesToClock(found.slot.startMinute),
        endTime: minutesToClock(found.slot.endMinute),
        startsAt: found.slot.startsAt.toISOString(),
      },
    });
  })
);

/** POST /admin-api/programs/:id/slot/check */
router.post(
  "/:id/slot/check",
  asyncHandler(async (req, res) => {
    const program = await findProgramRow(String(req.params.id));
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dayIndex = optionalInteger(body.dayIndex, "El día de emisión", { min: 1, max: 7 });
    const startTime = typeof body.startTime === "string" ? body.startTime : null;
    const durationSec = optionalFloat(body.durationSec, "La duración", {
      min: 1,
      max: 24 * 60 * 60,
    });

    if (!dayIndex || !startTime) {
      throw new AppError(400, "Indica el día y la hora de emisión.");
    }

    const startMinute = clockToMinutes(startTime);
    const endMinute = startMinute + Math.max(1, Math.ceil((durationSec ?? 1800) / 60));

    const available = await isWindowAvailable(
      program.playlistId,
      dayIndex,
      startMinute,
      endMinute,
      program.bufferMinutes
    );

    res.json({ available, startTime: minutesToClock(startMinute), endTime: minutesToClock(endMinute) });
  })
);

/** POST /admin-api/programs/:id/sync */
router.post(
  "/:id/sync",
  asyncHandler(async (req, res) => {
    logger.info("Programs", "Manual sync requested", { programId: String(req.params.id) });
    res.json(await syncProgram(String(req.params.id)));
  })
);

/** GET /admin-api/programs/episodes/:episodeId */
router.get(
  "/episodes/:episodeId",
  asyncHandler(async (req, res) => {
    res.json(await getEpisode(String(req.params.episodeId)));
  })
);

export default router;