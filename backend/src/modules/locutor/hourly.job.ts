import cron from "node-cron";
import { prisma } from "../../infrastructure/database/prisma";
import { generateOrReuseAudio, scheduleAudioForDate } from "./audioGeneration.service";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { getStationDayStart, getStationTime } from "../../shared/utils/date";

/**
 * Generates a single hour audio on-demand.
 */
async function generateHourAudio(hour24: number, dayStart: Date) {
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
      hour: hour24,
      group,
    });

    await scheduleAudioForDate(result.audioId, dayStart, hour24);

    logger.info("HourlyCheck", "Generated or reused audio for hour", {
      hour: hour24,
      wasReused: result.wasReused,
    });

    return result;
  } catch (err) {
    logger.error("HourlyCheck", "Failed to generate audio for hour", {
      hour: hour24,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function runHourlyCheck(): Promise<void> {
  // At :45 the hour that starts in 15 minutes may belong to the next station
  // day (23:45 -> 00:00), so the hour and its day come from the same instant.
  const nextHourInstant = new Date(Date.now() + 60 * 60 * 1000);
  const nextHour = getStationTime(nextHourInstant).hour;
  const nextHourDay = getStationDayStart(nextHourInstant);

  logger.info("HourlyCheck", "Checking audio for next hour", { nextHour });

  try {
    const existing = await prisma.audioSchedule.findFirst({
      where: {
        scheduledDate: nextHourDay,
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

    // Announcements are injected into the play queue and do not require empty
    // time blocks, so a blocked hour is not a reason to skip the generation.
    // If missing or not ready, generate it
    logger.warn("HourlyCheck", "Missing or invalid audio for next hour, regenerating", {
      nextHour,
      existingStatus: existing?.audio?.status || "none",
    });

    await generateHourAudio(nextHour, nextHourDay);
  } catch (err) {
    logger.error("HourlyCheck", "Error during hourly check", {
      nextHour,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function registerHourlyJob() {
  cron.schedule(
    "45 * * * *",
    () => {
      runHourlyCheck().catch((err) => {
        logger.error("HourlyCheck", "Scheduled run failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
    { timezone: config.locutor.timezone }
  );
}
