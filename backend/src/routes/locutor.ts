import { Router } from "express";
import { prisma } from "../lib/prisma";
import { synthesize } from "../services/tts.service";
import { renderTemplate } from "../services/template.service";
import { getAudioStats } from "../services/timeSlotPlanner.service";
import { getAudioCountByStatus } from "../services/audioGeneration.service";
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

export default router;
