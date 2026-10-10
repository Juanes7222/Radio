import path from "path";
import { unlink } from "fs/promises";
import { prisma } from "../../infrastructure/database/prisma";
import { preferredProviderId, synthesize } from "./tts.service";
import { getTemplateForHour, renderTemplate } from "./template.service";
import { uploadAudioToAzuraCast } from "../azuracast/playback.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationDayStart, getStationTime } from "../../shared/utils/date";
import type { AnnouncementTemplate } from "@prisma/client";
import type { LocutorBulkDeleteResult } from "@radio/types";
import type { TimeSlotGroup } from "./timeSlotPlanner.service";

const MEDIA_DIR = config.locutor.mediaDir;

export interface GenerationResult {
  audioId: string;
  filename: string;
  filepath: string;
  durationMs: number;
  fileSizeBytes: number;
  wasReused: boolean;
  provider: string;
  voice: string;
}

export interface GenerationRequest {
  templateId?: string;
  hour: number;
  minutes?: number;
  group: TimeSlotGroup;
  text?: string;
  voice?: string;
  speed?: number;
  stationName?: string;
}

/** A generation request that already resolved its template and voice engine. */
interface ResolvedGenerationRequest extends GenerationRequest {
  template: AnnouncementTemplate;
  voice: string;
  speed: number;
}

/**
 * Generates or reuses a time announcement audio.
 * If no templateId is provided, picks one automatically by
 * rotating across active templates based on (hour + dayIndex).
 * When reusing, it only reuses audio generated with the same template and the
 * same voice engine.
 */
export async function generateOrReuseAudio(request: GenerationRequest): Promise<GenerationResult> {
  const { hour, group } = request;

  // The template is resolved first because its voice decides which engine would
  // answer, and that engine is part of the reuse key.
  const template = request.templateId
    ? await prisma.announcementTemplate.findUnique({ where: { id: request.templateId } })
    : await getTemplateForHour(hour);

  if (!template) {
    throw new Error(`Template ${request.templateId} not found`);
  }

  const voice = request.voice || template.voice;
  const speed = request.speed || template.speed;
  const provider = preferredProviderId(voice);

  const existing = await findReusableAudio(hour, group, template.id, provider);
  if (existing) {
    logger.info("AudioGeneration", "Reusing existing audio", {
      audioId: existing.id,
      hour,
      group,
      templateId: template.id,
      provider,
    });

    return {
      audioId: existing.id,
      filename: existing.filename,
      filepath: existing.filepath,
      durationMs: existing.durationMs || 0,
      fileSizeBytes: existing.fileSizeBytes || 0,
      wasReused: true,
      provider: existing.provider,
      voice: existing.voice,
    };
  }

  return generateNewAudio({ ...request, template, voice, speed });
}

/**
 * Finds a reusable audio matching the hour, group and voice engine criteria.
 */
async function findReusableAudio(
  hour: number,
  group: TimeSlotGroup,
  templateId: string,
  provider: string
) {
  const today = getStationDayStart();

  return prisma.generatedAudio.findFirst({
    where: {
      hourValue: hour,
      timeSlotGroup: group,
      templateId,
      provider,
      status: "ready",
      OR: [{ lastUsedDate: null }, { lastUsedDate: { lt: today } }],
    },
    orderBy: [{ useCount: "asc" }, { generatedAt: "desc" }],
  });
}

/**
 * Generates a new audio file using TTS.
 */
async function generateNewAudio(request: ResolvedGenerationRequest): Promise<GenerationResult> {
  const { template, hour, minutes, group, text, voice, speed } = request;
  const templateId = template.id;

  const minute = minutes !== undefined ? minutes : 0;
  const renderedText =
    text ||
    renderTemplate(template.textTemplate, {
      hour24: hour,
      minutes: minute,
    });

  const filename = `hora_${String(hour).padStart(2, "0")}_${Date.now()}.mp3`;
  const filepath = path.join(MEDIA_DIR, filename);

  const synthesis = await synthesize({
    text: renderedText,
    voice,
    speed,
    outputPath: filepath,
  });

  let azuracastMediaId: string | null = null;
  try {
    azuracastMediaId = await uploadAudioToAzuraCast(filepath, filename);
  } catch (err) {
    logger.warn("AudioGeneration", "Failed to upload to AzuraCast, audio will be local only", {
      filename,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const audio = await prisma.generatedAudio.create({
    data: {
      templateId: template.id,
      filename,
      filepath,
      textRendered: renderedText,
      durationMs: synthesis.durationMs,
      fileSizeBytes: synthesis.fileSizeBytes,
      voice: synthesis.voice,
      provider: synthesis.provider,
      hourValue: hour,
      timeSlotGroup: group,
      status: "ready",
      azuracastMediaId: azuracastMediaId || null,
    },
  });

  logger.info("AudioGeneration", "Generated new audio", {
    audioId: audio.id,
    hour,
    group,
    provider: synthesis.provider,
    durationMs: synthesis.durationMs,
  });

  return {
    audioId: audio.id,
    filename,
    filepath,
    durationMs: synthesis.durationMs,
    fileSizeBytes: synthesis.fileSizeBytes,
    wasReused: false,
    provider: synthesis.provider,
    voice: synthesis.voice,
  };
}

/**
 * Marks an audio as used for scheduling and creates the schedule entry.
 */
export async function scheduleAudioForDate(
  audioId: string,
  date: Date,
  hour: number,
  azuracastPlaylistId?: string
): Promise<void> {
  // Normalized here so the (scheduledDate, scheduledHour) key is the same for
  // every writer and for the reader in playback.service.
  const dayStart = getStationDayStart(date);

  await prisma.generatedAudio.update({
    where: { id: audioId },
    data: {
      lastUsedAt: new Date(),
      lastUsedDate: dayStart,
      useCount: { increment: 1 },
    },
  });

  await prisma.audioSchedule.upsert({
    where: {
      scheduledDate_scheduledHour: {
        scheduledDate: dayStart,
        scheduledHour: hour,
      },
    },
    create: {
      audioId,
      scheduledDate: dayStart,
      scheduledHour: hour,
      azuracastPlaylistId: azuracastPlaylistId || null,
      enabled: true,
    },
    update: {
      audioId,
      azuracastPlaylistId: azuracastPlaylistId || null,
      enabled: true,
    },
  });

  logger.info("AudioGeneration", "Scheduled audio", {
    audioId,
    date: dayStart.toISOString().split("T")[0],
    hour,
  });
}

/**
 * Expires old audios that haven't been used in a long time
 * to free up disk space.
 */
export async function expireOldAudios(maxUnusedDays: number = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxUnusedDays);

  const oldAudios = await prisma.generatedAudio.findMany({
    where: {
      status: "ready",
      lastUsedAt: { lt: cutoff },
      useCount: { gt: 0 },
    },
  });

  let expired = 0;
  for (const audio of oldAudios) {
    await prisma.generatedAudio.update({
      where: { id: audio.id },
      data: { status: "expired" },
    });
    expired++;
  }

  if (expired > 0) {
    logger.info("AudioGeneration", "Expired old audios", { count: expired });
  }

  return expired;
}

/**
 * Returns count of audios by status.
 */
export async function getAudioCountByStatus(): Promise<Record<string, number>> {
  const result = await prisma.generatedAudio.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const counts: Record<string, number> = {};
  for (const row of result) {
    counts[row.status] = row._count.id;
  }
  return counts;
}

/**
 * Removes audios from the bank together with their files.
 *
 * Ids that no longer exist are skipped instead of failing: the panel fetched its
 * list before the click, so a stale id must not block deleting the rest.
 */
export async function deleteGeneratedAudios(ids: string[]): Promise<LocutorBulkDeleteResult> {
  const existing = await prisma.generatedAudio.findMany({
    where: { id: { in: ids } },
    select: { id: true, filepath: true },
  });

  if (existing.length > 0) {
    await prisma.generatedAudio.deleteMany({ where: { id: { in: ids } } });
  }

  // The row goes first: an orphaned mp3 is inert, while a row pointing at a
  // missing file would be handed to findReusableAudio and break that hour.
  const removed = await Promise.all(
    existing.map((audio) =>
      unlink(audio.filepath)
        .then(() => true)
        .catch((err: NodeJS.ErrnoException) => {
          logger.warn("AudioGeneration", "Audio row deleted but its file could not be removed", {
            audioId: audio.id,
            filepath: audio.filepath,
            error: err.message,
          });
          return false;
        })
    )
  );

  return {
    count: existing.length,
    filesFailed: removed.filter((ok: boolean) => !ok).length,
  };
}
