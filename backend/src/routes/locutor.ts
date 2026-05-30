import { Router } from 'express';
import { db } from '../db';
import { synthesize } from '../services/tts.service';
import { renderTemplate } from '../services/template.service';
import { config } from '../config';

const router = Router();
const MEDIA_DIR = config.locutor.mediaDir;

// --- TEMPLATES ---
router.get('/templates', (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM announcement_templates ORDER BY created_at DESC').all();
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', (req, res) => {
  try {
    const { type, name, text_template, voice, speed, active } = req.body;
    const stmt = db.prepare(`
      INSERT INTO announcement_templates (type, name, text_template, voice, speed, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(type, name, text_template, voice || 'ef_dora', speed || 0.95, active !== false ? 1 : 0);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Template created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/templates/:id', (req, res) => {
  try {
    const { type, name, text_template, voice, speed, active } = req.body;
    const stmt = db.prepare(`
      UPDATE announcement_templates SET
        type = ?, name = ?, text_template = ?, voice = ?, speed = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(type, name, text_template, voice, speed, active !== false ? 1 : 0, req.params.id);
    res.json({ message: 'Template updated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/templates/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM announcement_templates WHERE id = ?').run(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- AUDIOS ---
router.get('/audios', (req, res) => {
  try {
    const audios = db.prepare('SELECT * FROM generated_audios ORDER BY generated_at DESC LIMIT 100').all();
    res.json(audios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/audios/generate/:templateId', async (req, res) => {
  const template = db.prepare('SELECT * FROM announcement_templates WHERE id = ?').get(req.params.templateId) as any;
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const customFilename = `custom_${Date.now()}.mp3`;
  const outputPath = `${MEDIA_DIR}/${customFilename}`;

  const info = db.prepare(`
    INSERT INTO generated_audios (template_id, filename, filepath, text_rendered, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(template.id, customFilename, outputPath, '');

  const audioId = info.lastInsertRowid;
  res.status(202).json({ audioId, message: 'Generation started' });

  (async () => {
    try {
      const text = renderTemplate(template.text_template, req.body.variables || {});
      const { duration_ms, file_size_bytes } = await synthesize({
        text, voice: template.voice, speed: template.speed, outputPath
      });

      db.prepare(`
        UPDATE generated_audios
        SET filepath=?, text_rendered=?, duration_ms=?, file_size_bytes=?, status='ready', generated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(outputPath, text, duration_ms, file_size_bytes, audioId);
    } catch (err: any) {
      db.prepare("UPDATE generated_audios SET status='error' WHERE id=?").run(audioId);
      console.error('[OnDemandGeneration] Error:', err.message);
    }
  })();
});

router.delete('/audios/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM generated_audios WHERE id = ?').run(req.params.id);
    res.json({ message: 'Audio deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- STATUS ---
router.get('/status', async (req, res) => {
  try {
    let kokoroOk = false;
    try {
      const axiosObj = await import('axios');
      // @ts-ignore
      const axiosGet = axiosObj.default?.get || axiosObj.get;
      const { status } = await axiosGet(`${config.locutor.kokoroUrl}/health`, { timeout: 2000 });
      kokoroOk = status === 200;
    } catch (e) {}

    const lastJob = db.prepare('SELECT * FROM generation_logs ORDER BY started_at DESC LIMIT 1').get();
    const readyCount = db.prepare("SELECT COUNT(*) as c FROM generated_audios WHERE status='ready'").get() as any;
    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM generated_audios WHERE status='pending'").get() as any;

    res.json({
      kokoro: { healthy: kokoroOk },
      last_job: lastJob || null,
      bank: { ready: readyCount?.c || 0, pending: pendingCount?.c || 0 },
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logs', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM generation_logs ORDER BY started_at DESC LIMIT 50').all();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;