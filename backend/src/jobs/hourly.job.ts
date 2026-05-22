import cron from 'node-cron';
import { db } from '../db';
import { synthesize } from '../services/tts.service';
import { renderTemplate } from '../services/template.service';
import { config } from '../config';

const MEDIA_DIR = config.locutor.mediaDir;

async function generateHourAudio(hour24: number) {
  const filename = `hora_${String(hour24).padStart(2, '0')}.mp3`;
  const template = db.prepare('SELECT * FROM announcement_templates WHERE type = ? AND active = 1 LIMIT 1').get('hourly') as any;

  if (!template) {
     console.warn('[HourlyCheck] No active hourly template found.');
     return;
  }

  const hour12 = hour24 % 12 || 12;
  const text = renderTemplate(template.text_template, { hour: String(hour12), hour24: String(hour24) });
  const outputPath = `${MEDIA_DIR}/${filename}`;

  try {
     const { duration_ms, file_size_bytes } = await synthesize({
        text, voice: template.voice, speed: template.speed, outputPath
     });

     db.prepare(`
       INSERT INTO generated_audios
       (template_id, filename, filepath, text_rendered, duration_ms, file_size_bytes, voice, generated_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready')
       ON CONFLICT(filename) DO UPDATE SET
         filepath=excluded.filepath,
         text_rendered=excluded.text_rendered,
         duration_ms=excluded.duration_ms,
         file_size_bytes=excluded.file_size_bytes,
         voice=excluded.voice,
         generated_at=excluded.generated_at,
         status='ready'
     `).run(template.id, filename, outputPath, text, duration_ms, file_size_bytes, template.voice, new Date().toISOString());
     
     console.log(`[HourlyCheck] Regenerated ${filename} successfully.`);
  } catch (err: any) {
     console.error(`[HourlyCheck] Error regenerating ${filename}: ${err.message}`);
  }
}

export function registerHourlyJob() {
  cron.schedule('45 * * * *', async () => {
    const nextHour = (new Date().getHours() + 1) % 24;
    const filename = `hora_${String(nextHour).padStart(2,'0')}.mp3`;
    const audio = db.prepare('SELECT * FROM generated_audios WHERE filename = ?').get(filename) as any;

    if (!audio || audio.status !== 'ready') {
      console.warn(`[HourlyCheck] Falta ${filename}, regenerando...`);
      await generateHourAudio(nextHour);
    }
  }, { timezone: config.locutor.timezone });
}