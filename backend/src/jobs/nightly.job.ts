import cron from 'node-cron';
import { synthesize } from '../services/tts.service';
import { renderTemplate } from '../services/template.service';
import { db } from '../db';
import { config } from '../config';

const MEDIA_DIR = config.locutor.mediaDir;

function getItemsForTemplate(template: any) {
  // Logic to generate items based on template type
  if (template.type === 'hourly') {
    return Array.from({ length: 24 }, (_, i) => ({
      filename: `hora_${String(i).padStart(2, '0')}.mp3`,
      variables: { hour: String(i % 12 || 12), hour24: String(i) }
    }));
  }
  // Add other logic like greetings etc
  return [{ filename: `custom_${template.id}.mp3`, variables: {} }];
}

export function registerNightlyJob() {
  cron.schedule('30 2 * * *', async () => {
    const logEntry = db.prepare(
      'INSERT INTO generation_logs (job_type, status, started_at) VALUES (?, ?, ?)'
    ).run('scheduled', 'running', new Date().toISOString());

    const startTime = Date.now();
    let generated = 0;
    const errors: any[] = [];

    try {
      const templates = db.prepare(
        'SELECT * FROM announcement_templates WHERE active = 1'
      ).all();

      for (const template of templates as any[]) {
        const items = getItemsForTemplate(template);

        for (const item of items) {
          try {
            const text = renderTemplate(template.text_template, item.variables);
            const filename = item.filename;
            const outputPath = `${MEDIA_DIR}/${filename}`;

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

            generated++;
          } catch (err: any) {
             errors.push({ item: item.filename, error: err.message });
          }
        }
      }

      db.prepare(`
        UPDATE generation_logs SET status=?, audios_generated=?, duration_ms=?, details=?, finished_at=?
        WHERE id=?
      `).run(
        errors.length === 0 ? 'success' : 'partial',
        generated, Date.now() - startTime,
        JSON.stringify({ errors }),
        new Date().toISOString(), logEntry.lastInsertRowid
      );

      console.log(`[NightlyJob] ${generated} audios generados en ${Date.now() - startTime}ms. ${errors.length} errores.`);

    } catch (err: any) {
      db.prepare('UPDATE generation_logs SET status=?, details=?, finished_at=? WHERE id=?')
        .run('error', JSON.stringify({ error: err.message }), new Date().toISOString(), logEntry.lastInsertRowid);
    }
  }, { timezone: config.locutor.timezone });
}