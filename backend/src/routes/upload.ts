import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac',
      'audio/wav', 'audio/aac', 'audio/x-flac', 'audio/x-wav',
      'audio/mp4', 'audio/x-m4a',
    ];
    if (allowed.includes(file.mimetype) || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  },
});

/**
 * POST /admin-api/upload
 * Body: multipart/form-data
 *   - file      : archivo de audio
 *   - path      : (opcional) ruta relativa destino, preserva estructura de carpetas
 *                 ej. "Jesus Adrian Romero/Generacion/01 - Generacion.mp3"
 *   - playlist  : (opcional) ID de la playlist
 */
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No se recibió ningún archivo' });
    return;
  }

  try {
    const sanitizedOriginal = req.file.originalname.replace(/[^a-zA-Z0-9._\-() ÁÉÍÓÚáéíóúñÑüÜ]/g, '_');
    let uploadPath = sanitizedOriginal;

    if (req.body.path && String(req.body.path).trim() !== '') {
      uploadPath = String(req.body.path)
        .replace(/^\/+/, '')
        .split('/')
        .map((seg) => seg.replace(/[^a-zA-Z0-9._\-() ÁÉÍÓÚáéíóúñÑüÜ]/g, '_'))
        .join('/');
    }

    const base64File = req.file.buffer.toString('base64');

    const uploadRes = await axios.post(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files`,
      { path: uploadPath, file: base64File },
      {
        headers: {
          Authorization: `Bearer ${config.azuracast.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 300_000, // 5 min para archivos grandes
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const fileData = uploadRes.data as { id: number; unique_id: string; path: string };

    if (req.body.playlist && fileData.id) {
      try {
        await axios.put(
          `${config.azuracast.url}/api/station/${config.azuracast.stationId}/file/${fileData.id}`,
          { playlists: [{ id: parseInt(req.body.playlist, 10) }] },
          {
            headers: {
              Authorization: `Bearer ${config.azuracast.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10_000,
          }
        );
      } catch (playlistErr) {
        console.warn('No se pudo asignar playlist:', playlistErr);
      }
    }

    res.json({ ok: true, file: fileData });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).json({ error: err.response.data?.message ?? 'Error al subir archivo' });
    } else {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Error interno al subir el archivo' });
    }
  }
});

/**
 * GET /admin-api/upload/recent
 * Devuelve los últimos 20 archivos subidos.
 */
router.get('/recent', requireAuth, async (_req, res) => {
  try {
    const response = await axios.get(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files`,
      {
        headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
        params: { per_page: 20, page: 1 },
        timeout: 15_000,
      }
    );
    res.json(response.data);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(502).json({ error: 'Error al obtener archivos recientes' });
    }
  }
});

/**
 * POST /admin-api/upload/rescan
 * Ordena a AzuraCast re-escanear la biblioteca de medios.
 * Útil tras subir archivos por SFTP directamente al VPS.
 */
router.post('/rescan', requireAuth, async (_req, res) => {
  try {
    await axios.put(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files/batch`,
      { files: [], action: 'reprocess' },
      {
        headers: {
          Authorization: `Bearer ${config.azuracast.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
    res.json({ ok: true, message: 'Re-escaneo iniciado correctamente' });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      if (err.response.status < 400) {
        res.json({ ok: true });
        return;
      }
      res.status(err.response.status).json({ error: err.response.data?.message ?? 'Error al re-escanear' });
    } else {
      res.status(502).json({ error: 'No se pudo contactar con AzuraCast para el re-escaneo' });
    }
  }
});

/**
 * DELETE /admin-api/upload/:id
 * Elimina un archivo por unique_id.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await axios.delete(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/file/${req.params.id}`,
      {
        headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
        timeout: 10_000,
      }
    );
    res.json({ ok: true });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(502).json({ error: 'Error al eliminar el archivo' });
    }
  }
});

export default router;
