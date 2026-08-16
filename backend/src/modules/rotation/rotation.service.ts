import { prisma } from "../../infrastructure/database/prisma";
import { logger } from "../../shared/logger/logger";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { BOGOTA_TIME_ZONE } from "../../shared/utils/date";
import {
  emptyPlaylist,
  getFileDetail,
  getPlaylistOrder,
  listMediaInFolder,
  setFilePlaylists,
  type PlaylistOrderEntry,
} from "./azuracastPlaylist.service";

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

interface BibleChapterRow {
  book: string;
  chapter: number;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Loads all chapters of a translation ordered as they appear in the Bible
 * (1-based ordinal -> book/chapter).
 */
async function loadChapterOrdinals(translation: string): Promise<BibleChapterRow[]> {
  const chapters = await prisma.bibleChapter.findMany({
    where: { book: { translation: { abbreviation: translation } } },
    orderBy: [{ book: { order: "asc" } }, { number: "asc" }],
    include: { book: { select: { name: true } } },
  });

  return chapters.map((chapter) => ({
    book: chapter.book.name,
    chapter: chapter.number,
  }));
}

/**
 * Maps 1-based chapter ordinals to book/chapter references. Ordinals that
 * exceed the translation length wrap around so a looping rotation never
 * leaves the Bible.
 */
export async function resolveChapters(
  translation: string,
  ordinals: number[]
): Promise<ChapterRef[]> {
  if (ordinals.length === 0) return [];

  const rows = await loadChapterOrdinals(translation);
  if (rows.length === 0) return [];

  return ordinals.map((ordinal) => {
    const wrapped = ((ordinal - 1) % rows.length + rows.length) % rows.length;
    const row = rows[wrapped];
    return { ordinal: wrapped + 1, book: row.book, chapter: row.chapter };
  });
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

  const programNormalized = normalizeTitle(notifyProgram);
  const tokens: string[] = [];

  for (const device of devices) {
    const isSubscribed = parseSubscriptions(device.subscriptions).some(
      (subscription) => normalizeTitle(subscription) === programNormalized
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
 * source playlist, in order. Records the run in the rotation history and
 * advances the cursor.
 */
export async function runRotation(rotationId: string): Promise<RotationRunResult> {
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
    let source: PlaylistOrderEntry[] = [];
    try {
      source =
        rotation.sourceType === "folder" && rotation.sourceFolder
          ? await listMediaInFolder(rotation.sourceFolder)
          : await getPlaylistOrder(rotation.sourcePlaylistId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`No se pudo leer la fuente de audios: ${message}`);
    }

    if (source.length === 0) {
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
    const picked: Array<{ entry: PlaylistOrderEntry; ordinal: number }> = [];
    for (let step = 0; step < rotation.itemsPerDay; step++) {
      const position = rotation.cursor + step;
      if (position >= source.length) {
        if (!rotation.loop) break;
      }
      const entry = source[position % source.length];
      picked.push({
        entry,
        ordinal: rotation.bibleStartOrdinal + position,
      });
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

    // Resolve chapters when running in bible mode.
    if (rotation.bibleMode && rotation.translation) {
      result.chapters = await resolveChapters(
        rotation.translation,
        picked.map((item) => item.ordinal)
      );
    }

    // Advance the cursor. When not looping and the end is reached, stop.
    const advanced = rotation.cursor + result.itemsPicked;
    const nextCursor = advanced >= source.length
      ? rotation.loop
        ? advanced % source.length
        : source.length
      : advanced;

    await prisma.playlistRotation.update({
      where: { id: rotation.id },
      data: {
        cursor: nextCursor,
        lastRunAt: new Date(),
        ...(rotation.loop ? {} : { active: nextCursor < source.length }),
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
