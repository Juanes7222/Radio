import { Router } from "express";
import path from "path";
import { prisma } from "../../infrastructure/database/prisma";
import { synthesize } from "./tts.service";
import { renderTemplate } from "./template.service";
import { getAudioStats } from "./timeSlotPlanner.service";
import {
  getAudioCountByStatus,
  generateOrReuseAudio,
  scheduleAudioForDate,
  getTemplateForHour,
} from "./audioGeneration.service";
import { uploadAudioToAzuraCast } from "../azuracast/playback.service";
import { playFileAsLive } from "./streamer.service";
import { runNightlyGeneration } from "./nightly.job";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationDayStart, getStationTime } from "../../shared/utils/date";
import { requireAuth, requirePermission } from "../auth/auth.middleware";

const router = Router();
router.use(requireAuth, requirePermission("locutor"));
const MEDIA_DIR = config.locutor.mediaDir;

function getGroupForHour(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 6 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  if (hour >= 18 && hour <= 21) return "evening";
  return "night";
}

// --- TEMPLATES ---

router.get(
  "/templates",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.announcementTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(templates);
  })
);

router.post(
  "/templates",
  asyncHandler(async (req, res) => {
    const { type, name, text_template, voice, speed, active } = req.body;
    const template = await prisma.announcementTemplate.create({
      data: {
        type,
        name,
        textTemplate: text_template,
        voice: voice || "ef_dora",
        speed: speed || 0.95,
        active: active !== false,
      },
    });
    res.status(201).json({ id: template.id, message: "Template created" });
  })
);

router.put(
  "/templates/:id",
  asyncHandler(async (req, res) => {
    const { type, name, text_template, voice, speed, active } = req.body;
    await prisma.announcementTemplate.update({
      where: { id: String(req.params.id) },
      data: {
        type,
        name,
        textTemplate: text_template,
        voice,
        speed,
        active: active !== false,
      },
    });
    res.json({ message: "Template updated" });
  })
);

router.delete(
  "/templates/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);

    // The schema declares RESTRICT on this relation, so deleting a template
    // that still has audios fails with a raw database error. Saying it in
    // plain terms is what lets the admin delete the audios first.
    const dependentAudios = await prisma.generatedAudio.count({ where: { templateId: id } });

    if (dependentAudios > 0) {
      throw new AppError(
        409,
        `La plantilla tiene ${dependentAudios} audio(s) generado(s). Elimínalos primero si quieres borrar la plantilla.`
      );
    }

    await prisma.announcementTemplate.delete({ where: { id } });
    res.json({ message: "Template deleted" });
  })
);

// --- AUDIOS ---

router.get(
  "/audios",
  asyncHandler(async (_req, res) => {
    try {
      // Select only the fields the LocutorAudio contract needs. The schedules
      // relation is intentionally not loaded: no consumer reads it and joining
      // it fails when that table lags behind the code in production.
      const audios = await prisma.generatedAudio.findMany({
        orderBy: { generatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          filename: true,
          filepath: true,
          textRendered: true,
          durationMs: true,
          fileSizeBytes: true,
          voice: true,
          azuracastMediaId: true,
          generatedAt: true,
          status: true,
          hourValue: true,
          timeSlotGroup: true,
          useCount: true,
          templateId: true,
        },
      });

      // The template relation is resolved separately instead of being joined.
      // Audios generated before a template was removed keep a template_id that
      // no longer resolves, and Prisma rejects the whole query when a required
      // relation comes back null, which took down the whole list. The contract
      // in LocutorAudio already allows a null template, so the orphans are
      // reported as such rather than breaking the page.
      const templateIds = [...new Set(audios.map((audio) => audio.templateId))];
      const templates = await prisma.announcementTemplate.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true, type: true },
      });
      const templatesById = new Map(templates.map((t) => [t.id, { name: t.name, type: t.type }]));

      const orphans = templateIds.filter((id) => !templatesById.has(id)).length;
      if (orphans > 0) {
        logger.warn("LocutorRoutes", "Audios with a missing template", { orphans });
      }

      res.json(
        audios.map(({ templateId, ...audio }) => ({
          ...audio,
          template: templatesById.get(templateId) ?? null,
        }))
      );
    } catch (err) {
      logger.error("LocutorRoutes", "GET /audios failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  })
);

router.post(
  "/audios/generate/:templateId",
  asyncHandler(async (req, res) => {
    const template = await prisma.announcementTemplate.findUnique({
      where: { id: String(req.params.templateId) },
    });

    if (!template) {
      throw new AppError(404, "Template not found");
    }

    const customFilename = `custom_${Date.now()}.mp3`;
    const outputPath = path.join(MEDIA_DIR, customFilename);

    const audio = await prisma.generatedAudio.create({
      data: {
        templateId: template.id,
        filename: customFilename,
        filepath: outputPath,
        textRendered: "",
        voice: template.voice,
        status: "pending",
      },
    });

    res.status(202).json({ audioId: audio.id, message: "Generation started" });

    // Background generation
    void (async () => {
      try {
        const text = renderTemplate(template.textTemplate, req.body.variables || {});
        const { duration_ms, file_size_bytes } = await synthesize({
          text,
          voice: template.voice,
          speed: template.speed,
          outputPath,
        });

        await prisma.generatedAudio.update({
          where: { id: audio.id },
          data: {
            textRendered: text,
            durationMs: Math.round(duration_ms),
            fileSizeBytes: file_size_bytes,
            status: "ready",
          },
        });
      } catch (err) {
        await prisma.generatedAudio.update({
          where: { id: audio.id },
          data: { status: "error" },
        });
        logger.error("LocutorRoutes", "On-demand generation failed", {
          audioId: audio.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  })
);

router.get(
  "/audios/:id/stream",
  asyncHandler(async (req, res) => {
    const audio = await prisma.generatedAudio.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!audio) {
      throw new AppError(404, "Audio not found");
    }

    const fs = await import("fs");
    if (!fs.existsSync(audio.filepath)) {
      throw new AppError(404, "Audio file not found");
    }

    res.sendFile(audio.filepath);
  })
);

router.delete(
  "/audios/:id",
  asyncHandler(async (req, res) => {
    await prisma.generatedAudio.delete({
      where: { id: String(req.params.id) },
    });
    res.json({ message: "Audio deleted" });
  })
);

// --- STATUS ---

router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    let kokoroOk = false;
    try {
      const axios = await import("axios");
      const { status } = await axios.default.get(`${config.locutor.kokoroUrl}/health`, {
        timeout: 2000,
      });
      kokoroOk = status === 200;
    } catch {
      // Kokoro not reachable
    }

    const lastJob = await prisma.generationLog.findFirst({
      orderBy: { startedAt: "desc" },
    });

    const statusCounts = await getAudioCountByStatus();
    const stats = await getAudioStats();

    res.json({
      kokoro: { healthy: kokoroOk },
      last_job: lastJob || null,
      bank: {
        ready: statusCounts["ready"] || 0,
        pending: statusCounts["pending"] || 0,
        error: statusCounts["error"] || 0,
      },
      stats,
      timestamp: new Date().toISOString(),
    });
  })
);

// --- LOGS ---

router.get(
  "/logs",
  asyncHandler(async (_req, res) => {
    const logs = await prisma.generationLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    res.json(logs);
  })
);

// --- SCHEDULES ---

router.get(
  "/schedules",
  asyncHandler(async (req, res) => {
    const requested = req.query.date ? new Date(String(req.query.date)) : new Date();
    const date = getStationDayStart(Number.isNaN(requested.getTime()) ? new Date() : requested);

    const schedules = await prisma.audioSchedule.findMany({
      where: {
        scheduledDate: date,
      },
      include: {
        audio: {
          select: {
            filename: true,
            textRendered: true,
            durationMs: true,
            status: true,
          },
        },
      },
      orderBy: { scheduledHour: "asc" },
    });

    res.json(schedules);
  })
);

// --- MANUAL GENERATION (for testing/debugging) ---

router.post(
  "/generate-now/:hour",
  asyncHandler(async (req, res) => {
    const hour = parseInt(String(req.params.hour), 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      throw new AppError(400, "Invalid hour (0-23)");
    }

    const result = await generateOrReuseAudio({
      hour,
      minutes: new Date().getMinutes(),
      group: getGroupForHour(hour),
    });

    const today = getStationDayStart();

    await scheduleAudioForDate(result.audioId, today, hour);

    res.json({
      success: true,
      audioId: result.audioId,
      filename: result.filename,
      hour,
      wasReused: result.wasReused,
      durationMs: result.durationMs,
    });
  })
);

// --- FORCE PLAYBACK NOW ---

router.post(
  "/play-now/:hour",
  asyncHandler(async (req, res) => {
    const hour = parseInt(String(req.params.hour), 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      throw new AppError(400, "Invalid hour (0-23)");
    }

    const now = new Date();
    const minute = getStationTime(now).minute;

    const template = await getTemplateForHour(hour);

    const renderedText = renderTemplate(template.textTemplate, {
      hour24: hour,
      minutes: minute,
    });

    const filename = `hora_${String(hour).padStart(2, "0")}_${String(minute).padStart(2, "0")}_${now.getTime()}.mp3`;
    const filepath = path.join(config.locutor.mediaDir, filename);

    const { duration_ms } = await synthesize({
      text: renderedText,
      voice: template.voice,
      speed: template.speed,
      outputPath: filepath,
    });

    try {
      await playFileAsLive(filepath);

      res.json({
        success: true,
        hour,
        minute,
        text: renderedText,
        durationMs: duration_ms,
        file: filepath,
        message: "Announcement generated and played via live streamer",
      });
    } catch (err) {
      throw new AppError(500, JSON.stringify({
        success: false,
        hour,
        reason: "streamer_failed",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  })
);

// --- RETRY UPLOAD ---

router.post(
  "/retry-upload/:audioId",
  asyncHandler(async (req, res) => {
    const audio = await prisma.generatedAudio.findUnique({
      where: { id: String(req.params.audioId) },
    });

    if (!audio) {
      throw new AppError(404, "Audio not found");
    }

    const mediaId = await uploadAudioToAzuraCast(audio.filepath, audio.filename);

    await prisma.generatedAudio.update({
      where: { id: audio.id },
      data: { azuracastMediaId: mediaId },
    });

    res.json({
      success: true,
      audioId: audio.id,
      mediaId,
      message: "Audio uploaded to AzuraCast",
    });
  })
);

// --- TEMPLATE PREVIEW ---
// Renders a template at a chosen time without calling the TTS. Lets the panel
// show the exact sentence the listener will hear, which is the only way to
// judge whether a template reads naturally before spending a generation.

interface PreviewSample {
  label: string;
  hour24: number;
  minutes: number;
}

/**
 * The cases worth checking by hand: agreement on "la una" against "las dos",
 * both readings of 12:00, the quarter and half words, and a long past-the-half
 * minute, which is where the old "menos dieciocho" phrasing read badly.
 */
const PREVIEW_SAMPLES: PreviewSample[] = [
  { label: "medianoche en punto", hour24: 0, minutes: 0 },
  { label: "1:00 de la madrugada", hour24: 1, minutes: 0 },
  { label: "9:15 de la mañana", hour24: 9, minutes: 15 },
  { label: "12:00 del mediodía", hour24: 12, minutes: 0 },
  { label: "1:30 de la tarde", hour24: 13, minutes: 30 },
  { label: "21:42 de la noche", hour24: 21, minutes: 42 },
  { label: "23:58 de la noche", hour24: 23, minutes: 58 },
  { label: "19:45 de la noche", hour24: 19, minutes: 45 },
];

router.post(
  "/templates/preview",
  asyncHandler(async (req, res) => {
    const textTemplate = typeof req.body?.text_template === "string" ? req.body.text_template : "";
    const templateId = typeof req.body?.template_id === "string" ? req.body.template_id : null;

    let template = textTemplate;
    if (templateId) {
      const found = await prisma.announcementTemplate.findUnique({ where: { id: templateId } });
      if (!found) throw new AppError(404, "Template not found");
      template = found.textTemplate;
    }

    if (template.trim().length === 0) {
      throw new AppError(400, "Provide text_template or template_id");
    }

    res.json({
      samples: PREVIEW_SAMPLES.map((sample) => ({
        label: sample.label,
        text: renderTemplate(template, {
          hour24: sample.hour24,
          minutes: sample.minutes,
        }),
      })),
    });
  })
);

// --- SAFE HOURS DEBUG ---
// Reemplazado por /announcement/*: la lógica por hora quedó obsoleta porque
// un programa puede no cumplir su horario. Ver announcement.routes.ts.

// --- TRIGGER NIGHTLY JOB MANUALLY ---

router.post(
  "/run-nightly",
  asyncHandler(async (_req, res) => {
    res.json({ message: "Nightly generation started in background" });
    runNightlyGeneration().catch((err) => {
      logger.error("LocutorRoutes", "Manual nightly run failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  })
);

// --- TEST KOKORO CONNECTION ---

router.get(
  "/test-kokoro",
  asyncHandler(async (_req, res) => {
    const testText = "Prueba de conexión con Kokoro";
    const testPath = path.join(MEDIA_DIR, `test_kokoro_${Date.now()}.mp3`);

    const result = await synthesize({
      text: testText,
      voice: "ef_dora",
      speed: 0.95,
      outputPath: testPath,
    });

    const fs = await import("fs/promises");
    await fs.unlink(testPath).catch(() => {});

    res.json({
      success: true,
      message: "Kokoro responded successfully",
      durationMs: result.duration_ms,
      fileSizeBytes: result.file_size_bytes,
      kokoroUrl: config.locutor.kokoroUrl,
    });
  })
);

export default router;
