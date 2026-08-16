import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { requireAuth } from "../auth/auth.middleware";
import { runRotation, type ChapterRef } from "./rotation.service";
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
  bibleStartOrdinal: number;
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
  const bibleStartOrdinal = Number(body.bibleStartOrdinal ?? 1);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new AppError(400, "El cursor debe ser un entero no negativo");
  }
  if (!Number.isInteger(bibleStartOrdinal) || bibleStartOrdinal < 1) {
    throw new AppError(400, "El ordinal inicial debe ser un entero mayor que 0");
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
    bibleStartOrdinal,
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
  asyncHandler(async (req, res) => {
    const input = parseRotationInput(req.body as Record<string, unknown>);
    const rotation = await prisma.playlistRotation.create({ data: input });
    res.status(201).json(rotation);
  })
);

router.get(
  "/:id",
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
  asyncHandler(async (req, res) => {
    await prisma.playlistRotation.delete({ where: { id: String(req.params.id) } });
    res.json({ message: "Rotación eliminada" });
  })
);

router.post(
  "/:id/run",
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

router.get(
  "/:id/runs",
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
