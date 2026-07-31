import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { sendEmail } from '../utils/email';
import { requireAuth } from '../middleware/auth';
import { sendPrayerResponseNotification } from '../services/notification.service';

const router = Router();

function validatePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

router.post('/', async (req, res) => {
  const { name, request, deviceId } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'El nombre es obligatorio' });
    return;
  }

  if (!request || typeof request !== 'string' || request.trim().length === 0) {
    res.status(400).json({ error: 'La peticion es obligatoria' });
    return;
  }

  const trimmedName = name.trim();
  const trimmedRequest = request.trim();
  const trimmedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : null;

  try {
    const entry = await prisma.prayerRequest.create({
      data: {
        name: trimmedName,
        request: trimmedRequest,
        deviceId: trimmedDeviceId,
        estado: 'PENDIENTE',
      },
    });

    if (config.prayer.recipients.length > 0) {
      const subject = 'Nueva peticion de oracion recibida';
      const body = `
        <p><strong>De:</strong> ${escapeHtml(trimmedName)}</p>
        <p><strong>Peticion:</strong></p>
        <blockquote style="border-left: 3px solid #6366f1; padding-left: 12px; margin-left: 0; color: #334155;">
          ${escapeHtml(trimmedRequest).replace(/\n/g, '<br>')}
        </blockquote>
        <p style="font-size: 12px; color: #64748b;">Recibida el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
      `;

      for (const recipient of config.prayer.recipients) {
        sendEmail(recipient, subject, body).catch((err) => {
          console.error('Failed to send prayer email to', recipient, err);
        });
      }
    }

    res.status(201).json({
      id: entry.id,
      deviceId: entry.deviceId,
      name: entry.name,
      request: entry.request,
      estado: entry.estado,
      respuesta: entry.respuesta,
      answeredAt: entry.answeredAt,
      readAt: entry.readAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  } catch (err) {
    console.error('Error creating prayer request:', err);
    res.status(500).json({ error: 'Error al guardar la peticion' });
  }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit, skip } = validatePagination(req.query as Record<string, unknown>);

    const [rows, total] = await Promise.all([
      prisma.prayerRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.prayerRequest.count(),
    ]);

    res.json({
      rows,
      total,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Error fetching prayer requests:', err);
    res.status(500).json({ error: 'Error al obtener las peticiones' });
  }
});

router.get('/my/:deviceId', async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ error: 'deviceId es obligatorio' });
    return;
  }

  try {
    const rows = await prisma.prayerRequest.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ rows });
  } catch (err) {
    console.error('Error fetching my prayer requests:', err);
    res.status(500).json({ error: 'Error al obtener las peticiones' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const entry = await prisma.prayerRequest.findUnique({
      where: { id },
    });

    if (!entry) {
      res.status(404).json({ error: 'Peticion no encontrada' });
      return;
    }

    res.json(entry);
  } catch (err) {
    console.error('Error fetching prayer request:', err);
    res.status(500).json({ error: 'Error al obtener la peticion' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { estado, respuesta } = req.body;

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'ID es obligatorio' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (estado && typeof estado === 'string') {
    updateData.estado = estado;
  }
  if (respuesta !== undefined && typeof respuesta === 'string') {
    updateData.respuesta = respuesta;
  }

  if (estado === 'RESPONDIDA' && respuesta) {
    updateData.answeredAt = new Date();
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: 'No hay campos para actualizar' });
    return;
  }

  try {
    const entry = await prisma.prayerRequest.update({
      where: { id },
      data: updateData,
    });

    if (entry.respuesta && entry.deviceId) {
      const device = await prisma.device.findUnique({
        where: { deviceId: entry.deviceId },
      });

      if (device?.fcmToken) {
        sendPrayerResponseNotification(
          device.fcmToken,
          entry.id,
          entry.name
        ).catch((err) => {
          console.error('Failed to send push notification:', err);
        });
      }
    }

    res.json({
      id: entry.id,
      deviceId: entry.deviceId,
      name: entry.name,
      request: entry.request,
      estado: entry.estado,
      respuesta: entry.respuesta,
      answeredAt: entry.answeredAt,
      readAt: entry.readAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Peticion no encontrada' });
      return;
    }
    console.error('Error updating prayer request:', err);
    res.status(500).json({ error: 'Error al actualizar la peticion' });
  }
});

router.post('/:id/read', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.prayerRequest.update({
      where: { id },
      data: { readAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Peticion no encontrada' });
      return;
    }
    console.error('Error marking prayer as read:', err);
    res.status(500).json({ error: 'Error al marcar como leida' });
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default router;
