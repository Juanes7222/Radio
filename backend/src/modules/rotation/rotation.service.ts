import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { AppError } from "../../shared/errors/app-error";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { BOGOTA_TIME_ZONE } from "../../shared/utils/date";
import { normalizeText } from "../../shared/utils/text";
import {
  emptyPlaylist,
  getFileDetail,
  setFilePlaylists,
} from "./azuracastPlaylist.service";
import {
  loadRotationSource,
  type ResolvedChapter,
  type RotationSource,
  type RotationSourceConfig,
  type RotationSourceEntry,
} from "./bibleSource.service";

export interface ChapterRef {
  ordinal: number;
  book: string;
  chapter: number;
}

export interface RotationRunResult {
  status: "success" | "partial" | "error";
  itemsPicked: number;
  itemsPlaced: number;
  chapters: ChapterRef[];
  titles: string[];
  errors: string[];
}

/** Builds a compact summary like "Génesis 1-7" or "Génesis 1-2, Éxodo 3". */
export function formatChapters(chapters: ChapterRef[]): string {
  if (chapters.length === 0) return "";

  const parts: string[] = [];
  let current: ChapterRef | null = null;
  let rangeStart = 0;

  const flush = (): void => {
    if (!current) return;
    if (rangeStart === current.chapter) {
      parts.push(`${current.book} ${current.chapter}`);
    } else {
      parts.push(`${current.book} ${rangeStart}-${current.chapter}`);
    }
  };

  for (const chapter of chapters) {
    if (current && current.book === chapter.book && chapter.chapter === current.chapter + 1) {
      current = chapter;
    } else {
      flush();
      current = chapter;
      rangeStart = chapter.chapter;
    }
  }
  flush();

  return parts.join(", ");
}

async function notifyReading(notifyProgram: string, chapters: ChapterRef[]): Promise<void> {
  const devices = await prisma.device.findMany({
    where: { subscriptions: { not: null }, fcmToken: { not: null } },
    select: { fcmToken: true, subscriptions: true },
  });

  const programNormalized = normalizeText(notifyProgram);
  const tokens: string[] = [];

  for (const device of devices) {
    const isSubscribed = parseSubscriptions(device.subscriptions).some(
      (subscription) => normalizeText(subscription) === programNormalized
    );
    if (isSubscribed && device.fcmToken) {
      tokens.push(device.fcmToken);
    }
  }

  if (tokens.length === 0) return;

  const result = await sendPushToTokens(tokens, {
    title: "Lectura bíblica de hoy",
    body: `Hoy se leen ${formatChapters(chapters)}.`,
    data: {
      type: "bible_reading",
      chapters: formatChapters(chapters),
    },
  });

  if (result.invalidTokens.length > 0) {
    await prisma.device.updateMany({
      where: { fcmToken: { in: result.invalidTokens } },
      data: { fcmToken: null },
    });
  }

  logger.info("Rotation", "Bible reading push sent", {
    program: notifyProgram,
    sent: result.sent,
    failed: result.failed,
  });
}

/**
 * Rebuilds the target playlist with the next block of media taken from the
 * source, in order. Records the run in the rotation history and advances the
 * cursor.
 *
 * `preloadedSource` lets a caller reuse a source it already resolved, so the
 * alignment endpoint does not fetch the whole library twice.
 */
export async function runRotation(
  rotationId: string,
  preloadedSource?: RotationSource
): Promise<RotationRunResult> {
  const rotation = await prisma.playlistRotation.findUnique({ where: { id: rotationId } });

  if (!rotation) {
    throw new Error(`Rotation ${rotationId} not found`);
  }

  const result: RotationRunResult = {
    status: "success",
    itemsPicked: 0,
    itemsPlaced: 0,
    chapters: [],
    titles: [],
    errors: [],
  };

  try {
    let entries: RotationSourceEntry[] = [];
    try {
      const source = preloadedSource ?? (await loadRotationSource(rotation));
      entries = source.entries;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`No se pudo leer la fuente de audios: ${message}`);
    }

    if (entries.length === 0) {
      result.status = "error";
      if (result.errors.length === 0) {
        result.errors.push(
          rotation.sourceType === "folder"
            ? "La carpeta fuente no contiene audios."
            : "La playlist fuente está vacía o no es secuencial."
        );
      }
      await persistRun(rotationId, result);
      return result;
    }

    // Pick the next block starting at the cursor, wrapping only when looping.
    const picked: RotationSourceEntry[] = [];
    for (let step = 0; step < rotation.itemsPerDay; step++) {
      const position = rotation.cursor + step;
      if (position >= entries.length) {
        if (!rotation.loop) break;
      }
      picked.push(entries[position % entries.length]);
    }

    result.itemsPicked = picked.length;

    if (picked.length === 0) {
      result.status = "error";
      result.errors.push("La playlist fuente no tiene más items para colocar.");
      await persistRun(rotationId, result);
      return result;
    }

    // Replace the target playlist content.
    try {
      await emptyPlaylist(rotation.targetPlaylistId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`No se pudo vaciar la playlist destino: ${message}`);
    }

    for (const item of picked) {
      try {
        const file = await getFileDetail(item.entry.media.unique_id);
        const playlistIds = [
          ...new Set([
            ...file.playlists.map((playlist) => playlist.id),
            rotation.targetPlaylistId,
          ]),
        ];
        await setFilePlaylists(file.unique_id, playlistIds);
        result.itemsPlaced++;
        result.titles.push(file.title || file.path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Fallo al añadir ${item.entry.media.title || item.entry.media.path}: ${message}`);
      }
    }

    result.status = result.errors.length > 0 ? "partial" : "success";

    // The announced reading comes from the chapter each audio carries, so it
    // always matches what is actually played.
    if (rotation.bibleMode && rotation.translation) {
      result.chapters = picked
        .map((item) => item.chapter)
        .filter((chapter): chapter is ResolvedChapter => chapter !== null);

      const unmatched = picked.length - result.chapters.length;
      if (unmatched > 0) {
        logger.warn("Rotation", "Audios without a resolvable chapter", {
          rotationId,
          count: unmatched,
        });
      }
    }

    // Advance the cursor. When not looping and the end is reached, stop.
    const advanced = rotation.cursor + result.itemsPicked;
    const nextCursor = advanced >= entries.length
      ? rotation.loop
        ? advanced % entries.length
        : entries.length
      : advanced;

    await prisma.playlistRotation.update({
      where: { id: rotation.id },
      data: {
        cursor: nextCursor,
        lastRunAt: new Date(),
        ...(rotation.loop ? {} : { active: nextCursor < entries.length }),
      },
    });

    if (
      rotation.bibleMode &&
      rotation.notifyEnabled &&
      rotation.notifyProgram &&
      result.chapters.length > 0
    ) {
      try {
        await notifyReading(rotation.notifyProgram, result.chapters);
      } catch (err) {
        result.errors.push(
          `La notificación push falló: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    result.status = "error";
    logger.error("Rotation", "Run failed", { rotationId, error: message });
  }

  await persistRun(rotationId, result);
  return result;
}

async function persistRun(rotationId: string, result: RotationRunResult): Promise<void> {
  await prisma.rotationRunLog.create({
    data: {
      rotationId,
      status: result.status,
      itemsPicked: result.itemsPicked,
      itemsPlaced: result.itemsPlaced,
      details: JSON.stringify({
        titles: result.titles,
        chapters: result.chapters,
        errors: result.errors,
      }),
    },
  });
}

/** Rotation fields needed to resolve its ordered source and current position. */
type Rotation = RotationSourceConfig & { id: string; cursor: number; itemsPerDay: number };

/** Block of media a rotation would place next, starting at `cursor`. */
export interface RotationSourcePreview {
  total: number;
  cursor: number;
  unresolved: string[];
  current: ResolvedChapter | null;
  upcoming: Array<{ chapter: ResolvedChapter; title: string; path: string }>;
  /** Chapters available in the source, grouped by book, in canonical order. */
  books: Array<{ name: string; chapters: number[] }>;
}

function groupChaptersByBook(entries: RotationSourceEntry[]): Array<{ name: string; chapters: number[] }> {
  const byBook = new Map<string, number[]>();

  for (const item of entries) {
    if (item.chapter === null) continue;
    const chapters = byBook.get(item.chapter.book);
    if (chapters) {
      chapters.push(item.chapter.chapter);
    } else {
      byBook.set(item.chapter.book, [item.chapter.chapter]);
    }
  }

  return [...byBook.entries()].map(([name, chapters]) => ({ name, chapters }));
}

function buildPreview(
  source: RotationSource,
  cursor: number,
  itemsPerDay: number
): RotationSourcePreview {
  const upcoming = source.entries
    .slice(cursor, cursor + itemsPerDay)
    .flatMap((item) =>
      item.chapter === null
        ? []
        : [
            {
              chapter: item.chapter,
              title: item.entry.media.title || item.entry.media.path,
              path: item.entry.media.path,
            },
          ]
    );

  return {
    total: source.entries.length,
    cursor,
    unresolved: source.unresolved,
    current: source.entries[cursor]?.chapter ?? null,
    upcoming,
    books: groupChaptersByBook(source.entries),
  };
}

/**
 * Describes what a rotation is about to play, so the panel can show the real
 * position of the reading instead of an opaque cursor number.
 */
export async function previewRotationSource(rotation: Rotation): Promise<RotationSourcePreview> {
  const source = await loadRotationSource(rotation);
  return buildPreview(source, rotation.cursor, rotation.itemsPerDay);
}

/**
 * Moves the cursor of a rotation to the audio carrying `book` `chapter`, so a
 * reading that advanced by hand can be resumed by the automation.
 *
 * Returns the resolved chapter and the preview of the block that will be
 * placed from the new position.
 */
export async function alignRotation(
  rotation: Rotation,
  book: string,
  chapter: number
): Promise<{ preview: RotationSourcePreview; source: RotationSource }> {
  const source = await loadRotationSource(rotation);
  const index = source.entries.findIndex(
    (item) => item.chapter?.book === book && item.chapter?.chapter === chapter
  );

  if (index === -1) {
    throw new AppError(
      404,
      `No hay ningún audio de ${book} ${chapter} en la fuente de esta rotación.`
    );
  }

  await prisma.playlistRotation.update({
    where: { id: rotation.id },
    data: { cursor: index },
  });

  return { preview: buildPreview(source, index, rotation.itemsPerDay), source };
}

/** Runs all active rotations sequentially. */
export async function runAllActiveRotations(): Promise<RotationRunResult[]> {
  const rotations = await prisma.playlistRotation.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  const results: RotationRunResult[] = [];
  for (const rotation of rotations) {
    try {
      results.push(await runRotation(rotation.id));
    } catch (err) {
      logger.error("Rotation", "Rotation run threw", {
        rotationId: rotation.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/**
 * Computes the UTC instants that bound a calendar day in the station timezone.
 * Bogota is UTC-5, so local midnight is 05:00 UTC of the same calendar day.
 */
function bogotaDayRange(date: Date): { start: Date; end: Date } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter.format(date).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
  return { start, end: new Date(start.getTime() + 86_400_000 - 1) };
}

export async function getTodayReading(): Promise<{
  rotationName: string;
  chapters: ChapterRef[];
} | null> {
  const { start, end } = bogotaDayRange(new Date());

  const latestRun = await prisma.rotationRunLog.findFirst({
    where: {
      runDate: { gte: start, lte: end },
      status: { in: ["success", "partial"] },
      rotation: { bibleMode: true },
    },
    include: { rotation: { select: { name: true } } },
    orderBy: { runDate: "desc" },
  });

  if (!latestRun) return null;

  try {
    const details = JSON.parse(latestRun.details ?? "{}") as { chapters?: ChapterRef[] };
    const chapters = Array.isArray(details.chapters) ? details.chapters : [];
    return { rotationName: latestRun.rotation.name, chapters };
  } catch {
    return null;
  }
}
