import { Router } from "express";
import { prisma } from "../lib/prisma";
import { synthesize } from "../services/tts.service";
import { renderTemplate } from "../services/template.service";
import { getAudioStats } from "../services/timeSlotPlanner.service";
import { getAudioCountByStatus, generateOrReuseAudio, scheduleAudioForDate } from "../services/audioGeneration.service";
import { analyzeSafeHours as analyzeSafeHoursSafe, getBlockedHours } from "../services/scheduleAnalyzer.service";
import { playScheduledAnnouncementForHour } from "../services/playbackAzuracast.service";
import { runNightlyGeneration } from "../jobs/nightly.job";
import { config } from "../config";
import { logger } from "../utils/logger";
import path from "path";

const router = Router();
const MEDIA_DIR = config.locutor.mediaDir;

// --- TEMPLATES ---
router.get("/templates", async (_req, res) => {
  try {
    const templates = await prisma.announcementTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(templates);
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to list templates", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post("/templates", async (req, res) => {
  try {
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
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to create template", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put("/templates/:id", async (req, res) => {
  try {
    const { type, name, text_template, voice, speed, active } = req.body;
    await prisma.announcementTemplate.update({
      where: { id: req.params.id },
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
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to update template", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/templates/:id", async (req, res) => {
  try {
    await prisma.announcementTemplate.delete({
      where: { id: req.params.id },
    });
    res.json({ message: "Template deleted" });
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to delete template", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- AUDIOS ---
router.get("/audios", async (_req, res) => {
  try {
    const audios = await prisma.generatedAudio.findMany({
      orderBy: { generatedAt: "desc" },
      take: 100,
      include: {
        template: { select: { name: true, type: true } },
        schedules: { take: 5, orderBy: { scheduledDate: "desc" } },
      },
    });
    res.json(audios);
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to list audios", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post("/audios/generate/:templateId", async (req, res) => {
  try {
    const template = await prisma.announcementTemplate.findUnique({
      where: { id: req.params.templateId },
    });

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
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
    (async () => {
      try {
        const text = renderTemplate(
          template.textTemplate,
          req.body.variables || {}
        );
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
      } catch (err: any) {
        await prisma.generatedAudio.update({
          where: { id: audio.id },
          data: { status: "error" },
        });
        logger.error("LocutorRoutes", "On-demand generation failed", {
          audioId: audio.id,
          error: err.message,
        });
      }
    })();
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to start generation", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/audios/:id", async (req, res) => {
  try {
    await prisma.generatedAudio.delete({
      where: { id: req.params.id },
    });
    res.json({ message: "Audio deleted" });
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to delete audio", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- STATUS ---
router.get("/status", async (_req, res) => {
  try {
    let kokoroOk = false;
    try {
      const axios = await import("axios");
      const { status } = await axios.default.get(
        `${config.locutor.kokoroUrl}/health`,
        { timeout: 2000 }
      );
      kokoroOk = status === 200;
    } catch (e) {
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
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to get status", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- LOGS ---
router.get("/logs", async (_req, res) => {
  try {
    const logs = await prisma.generationLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    res.json(logs);
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to list logs", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SCHEDULES ---
router.get("/schedules", async (req, res) => {
  try {
    const date = req.query.date
      ? new Date(req.query.date as string)
      : new Date();
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
  } catch (err: any) {
    logger.error("LocutorRoutes", "Failed to list schedules", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- MANUAL GENERATION (for testing/debugging) ---
router.post("/generate-now/:hour", async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      return res.status(400).json({ error: "Invalid hour (0-23)" });
    }

    const template = await prisma.announcementTemplate.findFirst({
      where: { type: "hourly", active: true },
    });

    if (!template) {
      return res.status(404).json({ error: "No active hourly template found" });
    }

    const group =
      hour >= 6 && hour <= 11
        ? "morning"
        : hour >= 12 && hour <= 17
        ? "afternoon"
        : hour >= 18 && hour <= 21
        ? "evening"
        : "night";

    const result = await generateOrReuseAudio({
      templateId: template.id,
      hour,
      group,
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
  } catch (err: any) {
    logger.error("LocutorRoutes", "Manual generation failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- FORCE PLAYBACK NOW ---
router.post("/play-now/:hour", async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      return res.status(400).json({ error: "Invalid hour (0-23)" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedule = await prisma.audioSchedule.findFirst({
      where: {
        scheduledDate: today,
        scheduledHour: hour,
        enabled: true,
      },
      include: { audio: true },
    });

    if (!schedule || !schedule.audio) {
      return res.json({
        success: false,
        hour,
        reason: "no_schedule",
        message: "No schedule found for this hour",
      });
    }

    const audio = schedule.audio;

    if (audio.status !== "ready") {
      return res.json({
        success: false,
        hour,
        reason: "audio_not_ready",
        audioId: audio.id,
        status: audio.status,
        message: "Audio is not in ready status",
      });
    }

    if (!audio.azuracastMediaId) {
      return res.json({
        success: false,
        hour,
        reason: "no_azuracast_id",
        audioId: audio.id,
        filename: audio.filename,
        filepath: audio.filepath,
        message: "Audio was not uploaded to AzuraCast. Use the retry-upload endpoint.",
      });
    }

    try {
      const { playAnnouncementNow } = await import("../services/playbackAzuracast.service");
      await playAnnouncementNow(audio.azuracastMediaId);

      await prisma.audioSchedule.update({
        where: { id: schedule.id },
        data: { playedAt: new Date() },
      });

      return res.json({
        success: true,
        hour,
        audioId: audio.id,
        mediaId: audio.azuracastMediaId,
        message: "Announcement injected into AzuraCast queue",
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        hour,
        reason: "inject_failed",
        mediaId: audio.azuracastMediaId,
        error: err.message,
      });
    }
  } catch (err: any) {
    logger.error("LocutorRoutes", "Manual playback failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post("/retry-upload/:audioId", async (req, res) => {
  try {
    const audio = await prisma.generatedAudio.findUnique({
      where: { id: req.params.audioId },
    });

    if (!audio) {
      return res.status(404).json({ error: "Audio not found" });
    }

    const { uploadAudioToAzuraCast, addToAnnouncementPlaylist } = await import("../services/playbackAzuracast.service");

    const mediaId = await uploadAudioToAzuraCast(audio.filepath, audio.filename);
    await addToAnnouncementPlaylist(mediaId);

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
  } catch (err: any) {
    logger.error("LocutorRoutes", "Retry upload failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SAFE HOURS DEBUG ---
router.get("/safe-hours", async (_req, res) => {
  try {
    const safe = await analyzeSafeHoursSafe(new Date());
    const blocked = await getBlockedHours(new Date());
    res.json({ safe, blocked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- TRIGGER NIGHTLY JOB MANUALLY ---
router.post("/run-nightly", async (_req, res) => {
  try {
    res.json({ message: "Nightly generation started in background" });
    runNightlyGeneration().catch((err) => {
      logger.error("LocutorRoutes", "Manual nightly run failed", { error: err.message });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- TEST KOKORO CONNECTION ---
router.get("/test-kokoro", async (_req, res) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
      kokoroUrl: config.locutor.kokoroUrl,
    });
  }
});

export default router;
