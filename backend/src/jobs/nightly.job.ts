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
          "Running nightly generation (low-audience window preferred but not required)"
        );
      }

      await runNightlyGeneration();
    },
    { timezone: config.locutor.timezone }
  );
}

/**
 * Runs the nightly generation logic. Exposed so it can be triggered
 * manually for testing or one-off runs.
 */
export async function runNightlyGeneration(): Promise<void> {
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

    // Filter to safe hours only. If all hours are blocked (AzuraCast unreachable
    // or no special programming), we still proceed with all planned hours
    // because announcements are injected into the play queue and do not
    // require empty time blocks.
    const candidateHours = plan.map((p) => p.hour);
    const safeHours = await filterSafeHours(candidateHours);

    const effectiveSafeHours =
      safeHours.length > 0 ? safeHours : candidateHours;
    const usingFallback = safeHours.length === 0;

    const safePlan = plan.filter((p) => effectiveSafeHours.includes(p.hour));

    logger.info("NightlyJob", "Plan after schedule analysis", {
      totalPlanned: plan.length,
      safeHours: safeHours.length,
      usingFallback,
      daysAhead: DAYS_AHEAD,
    });

    for (const item of safePlan) {
      try {
        if (item.audioId) {
          await scheduleAudioForDate(item.audioId, item.date, item.hour);
          reusedCount++;
          logger.info("NightlyJob", "Reused audio for schedule", {
            hour: item.hour,
            date: item.date.toISOString().split("T")[0],
          });
        } else {
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

          await scheduleAudioForDate(result.audioId, item.date, item.hour);
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
          usingFallback,
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
}
