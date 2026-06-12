import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { generatePlan, isLowAudienceWindow } from "../services/timeSlotPlanner.service";
import { filterSafeHours } from "../services/scheduleAnalyzer.service";
import {
  generateOrReuseAudio,
  scheduleAudioForDate,
  expireOldAudios,
} from "../services/audioGeneration.service";
import { config } from "../config";
import { logger } from "../utils/logger";

const DAYS_AHEAD = 2;
const SLOTS_PER_GROUP = 24;

export function registerNightlyJob() {
  cron.schedule(
    "30 2 * * *",
    async () => {
      if (!isLowAudienceWindow()) {
        logger.info(
          "NightlyJob",
          "Skipping generation outside low-audience window"
        );
        return;
      }

      const log = await prisma.generationLog.create({
        data: {
          jobType: "scheduled",
          status: "running",
          startedAt: new Date(),
        },
      });

      const startTime = Date.now();
      let generatedCount = 0;
      let reusedCount = 0;
      const errors: Array<{ hour: number; error: string }> = [];

      try {
        logger.info("NightlyJob", "Starting nightly audio generation planning");

        // Generate plan for upcoming days
        const plan = await generatePlan({
          daysAhead: DAYS_AHEAD,
          slotsPerGroup: SLOTS_PER_GROUP,
        });

        if (plan.length === 0) {
          logger.info("NightlyJob", "No hours need coverage, nothing to do");
          await prisma.generationLog.update({
            where: { id: log.id },
            data: {
              status: "success",
              audiosGenerated: 0,
              durationMs: Date.now() - startTime,
              finishedAt: new Date(),
            },
          });
          return;
        }

        // Filter to safe hours only
        const candidateHours = plan.map((p) => p.hour);
        const safeHours = await filterSafeHours(candidateHours);

        const safePlan = plan.filter((p) => safeHours.includes(p.hour));

        logger.info("NightlyJob", "Plan after schedule analysis", {
          totalPlanned: plan.length,
          safeHours: safePlan.length,
          daysAhead: DAYS_AHEAD,
        });

        for (const item of safePlan) {
          try {
            if (item.audioId) {
              // Reuse existing audio
              await scheduleAudioForDate(
                item.audioId,
                item.date,
                item.hour
              );
              reusedCount++;
              logger.info("NightlyJob", "Reused audio for schedule", {
                hour: item.hour,
                date: item.date.toISOString().split("T")[0],
              });
            } else {
              // Find active template for this type
              const template = await prisma.announcementTemplate.findFirst({
                where: { type: "hourly", active: true },
              });

              if (!template) {
                errors.push({
                  hour: item.hour,
                  error: "No active hourly template found",
                });
                continue;
              }

              const result = await generateOrReuseAudio({
                templateId: template.id,
                hour: item.hour,
                group: item.group,
              });

              if (!result.wasReused) {
                generatedCount++;
              } else {
                reusedCount++;
              }

              await scheduleAudioForDate(
                result.audioId,
                item.date,
                item.hour
              );
            }
          } catch (err: any) {
            errors.push({
              hour: item.hour,
              error: err.message,
            });
            logger.error("NightlyJob", "Failed to process hour", {
              hour: item.hour,
              error: err.message,
            });
          }
        }

        // Expire old audios to free disk space
        const expired = await expireOldAudios(30);
        if (expired > 0) {
          logger.info("NightlyJob", "Expired old audios", { count: expired });
        }

        const status = errors.length === 0 ? "success" : "partial";

        await prisma.generationLog.update({
          where: { id: log.id },
          data: {
            status,
            audiosGenerated: generatedCount + reusedCount,
            durationMs: Date.now() - startTime,
            details: JSON.stringify({
              generated: generatedCount,
              reused: reusedCount,
              errors,
              expired,
            }),
            finishedAt: new Date(),
          },
        });

        logger.info("NightlyJob", "Completed nightly generation", {
          generated: generatedCount,
          reused: reusedCount,
          errors: errors.length,
          durationMs: Date.now() - startTime,
        });
      } catch (err: any) {
        logger.error("NightlyJob", "Fatal error during nightly generation", {
          error: err.message,
        });

        await prisma.generationLog.update({
          where: { id: log.id },
          data: {
            status: "error",
            details: JSON.stringify({ error: err.message }),
            finishedAt: new Date(),
          },
        });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
