import cron from "node-cron";
import path from "path";
import { getTemplateForHour } from "../services/audioGeneration.service";
import { renderTemplate } from "../services/template.service";
import { synthesize } from "../services/tts.service";
import { playFileAsLive } from "../services/locutorStreamer.service";
import { config } from "../config";
import { logger } from "../utils/logger";

function getTodayOffset(): number {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return dayOfYear % 51;
}

async function generateAndPlayNow(): Promise<boolean> {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  try {
    const template = await getTemplateForHour(currentHour);

    const renderedText = renderTemplate(template.textTemplate, {
      hour: String(currentHour % 12 || 12),
      hour24: String(currentHour),
      minutes: String(currentMinute).padStart(2, "0"),
    });

    const filename = `hora_${String(currentHour).padStart(2, "0")}_${String(currentMinute).padStart(2, "0")}_${Date.now()}.mp3`;
    const filepath = path.join(config.locutor.mediaDir, filename);

    const { duration_ms } = await synthesize({
      text: renderedText,
      voice: template.voice,
      speed: template.speed,
      outputPath: filepath,
    });

    logger.info("PlaybackJob", "Generated dynamic announcement", {
      hour: currentHour,
      minute: currentMinute,
      text: renderedText,
      durationMs: duration_ms,
    });

    await playFileAsLive(filepath);

    logger.info("PlaybackJob", "Dynamic announcement played", {
      hour: currentHour,
      minute: currentMinute,
    });

    return true;
  } catch (err: any) {
    logger.error("PlaybackJob", "Failed to generate and play announcement", {
      hour: currentHour,
      minute: currentMinute,
      error: err.message,
    });
    return false;
  }
}

export function registerPlaybackJob() {
  const minuteOffset = getTodayOffset();
  const cronExpr = `${minuteOffset} * * * *`;

  cron.schedule(
    cronExpr,
    async () => {
      const currentHour = new Date().getHours();

      logger.info("PlaybackJob", "Generating dynamic announcement", {
        hour: currentHour,
        minuteOffset,
      });

      await generateAndPlayNow();
    },
    { timezone: config.locutor.timezone }
  );

  logger.info(
    "PlaybackJob",
    `Registered playback job at minute ${minuteOffset} of every hour (varies per day)`
  );
}
