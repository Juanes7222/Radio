/**
 * RF-4: Subida de archivos de audio.
 * Recibe multipart/form-data, forwards el archivo a AzuraCast
 * y opcionalmente lo asigna a una playlist.
 */
import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/wav', 'audio/aac'];
    if (allowed.includes(file.mimetype)) {
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
 *   - playlist  : (opcional) ID de la playlist
 */
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No se recibió ningún archivo' });
    return;
  }

  try {
    // AzuraCast POST /api/station/{id}/files espera JSON con:
    //   path : ruta relativa de destino (ej. "archivo.mp3")
    //   file : contenido del archivo codificado en base64
    const sanitizedName = req.file.originalname.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const uploadPath = req.body.path
      ? String(req.body.path).replace(/^\/+/, '')
      : sanitizedName;

    const base64File = req.file.buffer.toString('base64');

    const uploadRes = await axios.post(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files`,
      { path: uploadPath, file: base64File },
      {
        headers: {
          Authorization: `Bearer ${config.azuracast.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
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
            timeout: 10000,
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
 * Devuelve los últimos 10 archivos subidos.
 */
router.get('/recent', requireAuth, async (_req, res) => {
  try {
    const response = await axios.get(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/files`,
      {
        headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
        params: { per_page: 10, page: 1 },
        timeout: 10000,
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
 * DELETE /admin-api/upload/:id
 * Elimina un archivo por ID.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await axios.delete(
      `${config.azuracast.url}/api/station/${config.azuracast.stationId}/file/${req.params.id}`,
      {
        headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
        timeout: 10000,
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
