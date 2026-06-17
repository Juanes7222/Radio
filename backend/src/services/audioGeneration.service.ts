import path from "path";
import { prisma } from "../lib/prisma";
import { synthesize } from "./tts.service";
import { renderTemplate } from "./template.service";
import { uploadAudioToAzuraCast, addToAnnouncementPlaylist } from "./playbackAzuracast.service";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { TimeSlotGroup } from "./timeSlotPlanner.service";

const MEDIA_DIR = config.locutor.mediaDir;

export interface GenerationResult {
  audioId: string;
  filename: string;
  filepath: string;
  durationMs: number;
  fileSizeBytes: number;
  wasReused: boolean;
}

export interface GenerationRequest {
  templateId: string;
  hour: number;
  group: TimeSlotGroup;
  text?: string;
  voice?: string;
  speed?: number;
}

/**
 * Generates or reuses a time announcement audio.
 * If a suitable reusable audio exists, it returns that one.
 * Otherwise, it generates a new audio using TTS.
 */
export async function generateOrReuseAudio(
  request: GenerationRequest
): Promise<GenerationResult> {
  const { templateId, hour, group } = request;

  const existing = await findReusableAudio(hour, group);
  if (existing) {
    logger.info("AudioGeneration", "Reusing existing audio", {
      audioId: existing.id,
      hour,
      group,
    });

    return {
      audioId: existing.id,
      filename: existing.filename,
      filepath: existing.filepath,
      durationMs: existing.durationMs || 0,
      fileSizeBytes: existing.fileSizeBytes || 0,
      wasReused: true,
    };
  }

  return generateNewAudio(request);
}

/**
 * Finds a reusable audio matching the hour and group criteria.
 */
async function findReusableAudio(
  hour: number,
  group: TimeSlotGroup
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return prisma.generatedAudio.findFirst({
    where: {
      hourValue: hour,
      timeSlotGroup: group,
      status: "ready",
      OR: [
        { lastUsedDate: null },
        { lastUsedDate: { lt: today } },
      ],
    },
    orderBy: [
      { useCount: "asc" },
      { generatedAt: "desc" },
    ],
  });
}

/**
 * Generates a new audio file using TTS.
 */
async function generateNewAudio(
  request: GenerationRequest
): Promise<GenerationResult> {
  const { templateId, hour, group, text, voice, speed } = request;

  const template = await prisma.announcementTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  const hour12 = hour % 12 || 12;
  const renderedText =
    text ||
    renderTemplate(template.textTemplate, {
      hour: String(hour12),
      hour24: String(hour),
    });

  const filename = `hora_${String(hour).padStart(2, "0")}_${Date.now()}.mp3`;
  const filepath = path.join(MEDIA_DIR, filename);

  const { duration_ms, file_size_bytes } = await synthesize({
    text: renderedText,
    voice: voice || template.voice,
    speed: speed || template.speed,
    outputPath: filepath,
  });

  let azuracastMediaId: string | null = null;
  try {
    azuracastMediaId = await uploadAudioToAzuraCast(filepath, filename);
    await addToAnnouncementPlaylist(azuracastMediaId);
  } catch (err: any) {
    logger.warn("AudioGeneration", "Failed to upload to AzuraCast, audio will be local only", {
      filename,
      error: err.message,
    });
  }

  const audio = await prisma.generatedAudio.create({
    data: {
      templateId: template.id,
      filename,
      filepath,
      textRendered: renderedText,
      durationMs: Math.round(duration_ms),
      fileSizeBytes: file_size_bytes,
      voice: voice || template.voice,
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
    durationMs: Math.round(duration_ms),
  });

  return {
    audioId: audio.id,
    filename,
    filepath,
    durationMs: Math.round(duration_ms),
    fileSizeBytes: file_size_bytes,
    wasReused: false,
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
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  await prisma.generatedAudio.update({
    where: { id: audioId },
    data: {
      lastUsedAt: new Date(),
      lastUsedDate: dateOnly,
      useCount: { increment: 1 },
    },
  });

  await prisma.audioSchedule.upsert({
    where: {
      scheduledDate_scheduledHour: {
        scheduledDate: date,
        scheduledHour: hour,
      },
    },
    create: {
      audioId,
      scheduledDate: date,
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

  logger.info("AudioGeneration", "Scheduled audio", { audioId, date: dateOnly.toISOString().split("T")[0], hour });
}

/**
 * Expires old audios that haven't been used in a long time
 * to free up disk space.
 */
export async function expireOldAudios(
  maxUnusedDays: number = 30
): Promise<number> {
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
