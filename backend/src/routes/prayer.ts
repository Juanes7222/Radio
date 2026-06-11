import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { sendEmail } from '../utils/email';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * Creates a prayer request and notifies configured recipients via email.
 */
router.post('/', async (req, res) => {
  const { name, request } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'El nombre es obligatorio' });
    return;
  }

  if (!request || typeof request !== 'string' || request.trim().length === 0) {
    res.status(400).json({ error: 'La petición es obligatoria' });
    return;
  }

  const trimmedName = name.trim();
  const trimmedRequest = request.trim();

  try {
    const entry = await prisma.prayerRequest.create({
      data: {
        name: trimmedName,
        request: trimmedRequest,
      },
    });

    if (config.prayer.recipients.length > 0) {
      const subject = 'Nueva petición de oración recibida';
      const body = `
        <p><strong>De:</strong> ${escapeHtml(trimmedName)}</p>
        <p><strong>Petición:</strong></p>
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

    res.status(201).json({ id: entry.id, name: entry.name, request: entry.request, createdAt: entry.createdAt });
  } catch (err) {
    console.error('Error creating prayer request:', err);
    res.status(500).json({ error: 'Error al guardar la petición' });
  }
});

/**
 * Lists all prayer requests (admin only).
 */
router.get('/', requireAuth, async (_req, res) => {
  try {
    const rows = await prisma.prayerRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ rows });
  } catch (err) {
    console.error('Error fetching prayer requests:', err);
    res.status(500).json({ error: 'Error al obtener las peticiones' });
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
