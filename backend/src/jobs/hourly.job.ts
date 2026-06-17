import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { generateOrReuseAudio, scheduleAudioForDate } from "../services/audioGeneration.service";
import { getPendingHoursForToday } from "../services/timeSlotPlanner.service";
import { filterSafeHours } from "../services/scheduleAnalyzer.service";
import { config } from "../config";
import { logger } from "../utils/logger";

/**
 * Generates a single hour audio on-demand.
 */
async function generateHourAudio(hour24: number) {
  const template = await prisma.announcementTemplate.findFirst({
    where: { type: "hourly", active: true },
  });

  if (!template) {
    logger.warn("HourlyCheck", "No active hourly template found");
    return null;
  }

  const group =
    hour24 >= 6 && hour24 <= 11
      ? "morning"
      : hour24 >= 12 && hour24 <= 17
      ? "afternoon"
      : hour24 >= 18 && hour24 <= 21
      ? "evening"
      : "night";

  try {
    const result = await generateOrReuseAudio({
      templateId: template.id,
      hour: hour24,
      group,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await scheduleAudioForDate(result.audioId, today, hour24);

    logger.info("HourlyCheck", "Generated or reused audio for hour", {
      hour: hour24,
      wasReused: result.wasReused,
    });

    return result;
  } catch (err: any) {
    logger.error("HourlyCheck", "Failed to generate audio for hour", {
      hour: hour24,
      error: err.message,
    });
    return null;
  }
}

export function registerHourlyJob() {
  cron.schedule(
    "45 * * * *",
    async () => {
      const nextHour = (new Date().getHours() + 1) % 24;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      logger.info("HourlyCheck", "Checking audio for next hour", {
        nextHour,
      });

      try {
        const existing = await prisma.audioSchedule.findFirst({
          where: {
            scheduledDate: today,
            scheduledHour: nextHour,
            enabled: true,
          },
          include: {
            audio: true,
          },
        });

        if (existing && existing.audio && existing.audio.status === "ready") {
          logger.info("HourlyCheck", "Audio ready for next hour", {
            nextHour,
            audioId: existing.audioId,
          });
          return;
        }

        // Check if it's safe to insert an announcement.
        // If the schedule analyzer cannot reach AzuraCast or reports
        // no safe hours, we still attempt to generate the audio so the
        // radio can announce the time. Announcements are injected into
        // the play queue and do not require empty time blocks.
        const safeHours = await filterSafeHours([nextHour]);
        if (safeHours.length === 0) {
          logger.info("HourlyCheck", "Schedule analyzer reports no safe hours, proceeding anyway", {
            nextHour,
          });
        }

        // If missing or not ready, generate it
        logger.warn("HourlyCheck", "Missing or invalid audio for next hour, regenerating", {
          nextHour,
          existingStatus: existing?.audio?.status || "none",
        });

        await generateHourAudio(nextHour);
      } catch (err: any) {
        logger.error("HourlyCheck", "Error during hourly check", {
          nextHour,
          error: err.message,
        });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
