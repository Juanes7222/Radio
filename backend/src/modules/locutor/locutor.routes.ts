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
import { analyzeSafeHours, getBlockedHours } from "../schedule/analyzer.service";
import { uploadAudioToAzuraCast } from "../azuracast/playback.service";
import { playFileAsLive } from "./streamer.service";
import { runNightlyGeneration } from "./nightly.job";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { requireAuth } from "../auth/auth.middleware";

const router = Router();
router.use(requireAuth);
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
    await prisma.announcementTemplate.delete({
      where: { id: String(req.params.id) },
    });
    res.json({ message: "Template deleted" });
  })
);

// --- AUDIOS ---

router.get(
  "/audios",
  asyncHandler(async (_req, res) => {
    const audios = await prisma.generatedAudio.findMany({
      orderBy: { generatedAt: "desc" },
      take: 100,
      include: {
        template: { select: { name: true, type: true } },
        schedules: { take: 5, orderBy: { scheduledDate: "desc" } },
      },
    });
    res.json(audios);
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
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    date.setHours(0, 0, 0, 0);

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    const minute = now.getMinutes();

    const template = await getTemplateForHour(hour);

    const renderedText = renderTemplate(template.textTemplate, {
      hour: String(hour % 12 || 12),
      hour24: String(hour),
      minutes: String(minute).padStart(2, "0"),
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

// --- SAFE HOURS DEBUG ---

router.get(
  "/safe-hours",
  asyncHandler(async (_req, res) => {
    const safe = await analyzeSafeHours(new Date());
    const blocked = await getBlockedHours(new Date());
    res.json({ safe, blocked });
  })
);

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
