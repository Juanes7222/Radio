import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import {
  alignRotation,
  previewRotationSource,
  runRotation,
  type ChapterRef,
} from "./rotation.service";
import { resolveCanonicalBookName } from "./bibleSource.service";
import { BOGOTA_TIME_ZONE } from "../../shared/utils/date";

const router = Router();
router.use(requireAuth);

interface RotationInput {
  name: string;
  sourceType: "playlist" | "folder";
  sourcePlaylistId: number;
  sourceFolder: string | null;
  targetPlaylistId: number;
  itemsPerDay: number;
  cursor: number;
  loop: boolean;
  active: boolean;
  bibleMode: boolean;
  translation: string | null;
  notifyEnabled: boolean;
  notifyProgram: string | null;
}

function parseRotationInput(body: Record<string, unknown>): RotationInput {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name === "") {
    throw new AppError(400, "El nombre es obligatorio");
  }

  const sourceType: "playlist" | "folder" = body.sourceType === "folder" ? "folder" : "playlist";

  let sourcePlaylistId = 0;
  let sourceFolder: string | null = null;

  if (sourceType === "folder") {
    sourceFolder =
      typeof body.sourceFolder === "string" && body.sourceFolder.trim() !== ""
        ? body.sourceFolder.trim()
        : null;
    if (!sourceFolder) {
      throw new AppError(400, "Indica la carpeta de la biblioteca de la fuente");
    }
  } else {
    sourcePlaylistId = Number(body.sourcePlaylistId);
    if (!Number.isInteger(sourcePlaylistId) || sourcePlaylistId <= 0) {
      throw new AppError(400, "La playlist fuente es obligatoria");
    }
  }

  const targetPlaylistId = Number(body.targetPlaylistId);
  if (!Number.isInteger(targetPlaylistId) || targetPlaylistId <= 0) {
    throw new AppError(400, "La playlist destino es obligatoria");
  }
  if (sourceType === "playlist" && sourcePlaylistId === targetPlaylistId) {
    throw new AppError(400, "La playlist fuente y la destino deben ser distintas");
  }

  const itemsPerDay = Number(body.itemsPerDay);
  if (!Number.isInteger(itemsPerDay) || itemsPerDay < 1 || itemsPerDay > 100) {
    throw new AppError(400, "El número de audios por día debe estar entre 1 y 100");
  }

  const cursor = Number(body.cursor ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new AppError(400, "El cursor debe ser un entero no negativo");
  }

  return {
    name,
    sourceType,
    sourcePlaylistId,
    sourceFolder,
    targetPlaylistId,
    itemsPerDay,
    cursor,
    loop: body.loop !== false,
    active: body.active !== false,
    bibleMode: body.bibleMode === true,
    translation:
      typeof body.translation === "string" && body.translation.trim() !== ""
        ? body.translation.trim()
        : null,
    notifyEnabled: body.notifyEnabled === true,
    notifyProgram:
      typeof body.notifyProgram === "string" && body.notifyProgram.trim() !== ""
        ? body.notifyProgram.trim()
        : null,
  };
}

function formatDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

router.get(
  "/",
  requirePermission("rotations"),
  asyncHandler(async (_req, res) => {
    const rotations = await prisma.playlistRotation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        runs: {
          take: 1,
          orderBy: { runDate: "desc" },
        },
      },
    });
    res.json(rotations);
  })
);

// Historial de capítulos emitidos por las rotaciones bíblicas, del más
// reciente al más antiguo. Usado por la página de historial del panel.
router.get(
  "/history",
  requirePermission("reading.history"),
  asyncHandler(async (req, res) => {
    const requested = Number(req.query.limit ?? 90);
    const limit = Number.isInteger(requested) ? Math.min(requested, 200) : 90;

    const runs = await prisma.rotationRunLog.findMany({
      where: { rotation: { bibleMode: true } },
      include: { rotation: { select: { name: true } } },
      orderBy: { runDate: "desc" },
      take: limit,
    });

    res.json(
      runs.map((run) => {
        let chapters: ChapterRef[] = [];
        try {
          const details = JSON.parse(run.details ?? "{}") as { chapters?: ChapterRef[] };
          chapters = Array.isArray(details.chapters) ? details.chapters : [];
        } catch {
          // Malformed details fall back to an empty chapter list.
        }
        return {
          id: run.id,
          rotationId: run.rotationId,
          rotationName: run.rotation.name,
          runDate: run.runDate,
          dateKey: formatDateKey(run.runDate),
          status: run.status,
          itemsPicked: run.itemsPicked,
          itemsPlaced: run.itemsPlaced,
          chapters,
        };
      })
    );
  })
);

router.post(
  "/",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    const input = parseRotationInput(req.body as Record<string, unknown>);
    const rotation = await prisma.playlistRotation.create({ data: input });
    res.status(201).json(rotation);
  })
);

router.get(
  "/:id",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    const rotation = await prisma.playlistRotation.findUnique({
      where: { id: String(req.params.id) },
      include: { runs: { take: 50, orderBy: { runDate: "desc" } } },
    });
    if (!rotation) {
      throw new AppError(404, "Rotación no encontrada");
    }
    res.json(rotation);
  })
);

router.put(
  "/:id",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.playlistRotation.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      throw new AppError(404, "Rotación no encontrada");
    }
    // Merge the payload over the existing record so fields the form does not
    // expose (cursor) are preserved instead of being reset to their defaults.
    const input = parseRotationInput({ ...existing, ...(req.body as Record<string, unknown>) });
    const rotation = await prisma.playlistRotation.update({
      where: { id: existing.id },
      data: input,
    });
    res.json(rotation);
  })
);

router.delete(
  "/:id",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    await prisma.playlistRotation.delete({ where: { id: String(req.params.id) } });
    res.json({ message: "Rotación eliminada" });
  })
);

router.post(
  "/:id/run",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.playlistRotation.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) {
      throw new AppError(404, "Rotación no encontrada");
    }
    const result = await runRotation(existing.id);
    res.json({ ...result, rotationId: existing.id });
  })
);

// Qué va a reproducir la rotación a partir de su cursor actual, y qué
// capítulos quedan sin resolver en la fuente. Permite al operador ver la
// posición real de la lectura en vez de un número de cursor opaco.
router.get(
  "/:id/source",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    const rotation = await requireRotation(String(req.params.id));
    res.json(await previewRotationSource(rotation));
  })
);

// Reanuda una lectura que se avanzó a mano: mueve el cursor al audio del
// capítulo indicado y ejecuta la rotación de inmediato.
router.post(
  "/:id/align",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    const rotation = await requireRotation(String(req.params.id));

    if (!rotation.bibleMode || !rotation.translation) {
      throw new AppError(400, "Solo las rotaciones bíblicas se pueden alinear por capítulo.");
    }

    const body = req.body as Record<string, unknown>;
    const book = typeof body.book === "string" ? body.book.trim() : "";
    const chapter = Number(body.chapter);
    if (book === "") {
      throw new AppError(400, "Indica el libro de la lectura.");
    }
    if (!Number.isInteger(chapter) || chapter < 1) {
      throw new AppError(400, "Indica un capítulo válido.");
    }

    const canonicalBook = await resolveCanonicalBookName(rotation.translation, book);
    if (!canonicalBook) {
      throw new AppError(404, `El libro "${book}" no existe en ${rotation.translation}.`);
    }

    const { preview, source } = await alignRotation(rotation, canonicalBook, chapter);
    const run = await runRotation(rotation.id, source);

    res.json({ ...preview, run });
  })
);

async function requireRotation(id: string) {
  const rotation = await prisma.playlistRotation.findUnique({ where: { id } });
  if (!rotation) {
    throw new AppError(404, "Rotación no encontrada");
  }
  return rotation;
}

router.get(
  "/:id/runs",
  requirePermission("rotations"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const runs = await prisma.rotationRunLog.findMany({
      where: { rotationId: String(req.params.id) },
      orderBy: { runDate: "desc" },
      take: Number.isInteger(limit) ? limit : 50,
    });
    res.json(runs);
  })
);

export default router;
