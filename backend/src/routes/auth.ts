import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const router = Router();
const googleClient = new OAuth2Client(config.google.clientId);

/**
 * POST /admin-api/auth/google
 * Recibe el credential (ID token) de Google, lo verifica,
 * comprueba la whitelist y devuelve un JWT de sesión propio.
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: 'Falta el credential de Google' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(401).json({ error: 'Token de Google inválido' });
      return;
    }

    if (!config.whitelist.includes(payload.email.toLowerCase())) {
      res.status(403).json({ error: 'Tu cuenta no tiene acceso al panel de administración.' });
      return;
    }

    let stationName = 'Radio';
    try {
      const stationRes = await axios.get(
        `${config.azuracast.url}/api/station/${config.azuracast.stationId}`,
        { headers: { Authorization: `Bearer ${config.azuracast.apiKey}` }, timeout: 5000 }
      );
      stationName = stationRes.data?.name ?? 'Radio';
    } catch {
      // No crítico si falla
    }

    const sessionPayload = {
      email: payload.email,
      name: payload.name ?? payload.email,
      picture: payload.picture ?? '',
      stationName,
    };

    const token = jwt.sign(sessionPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.json({ token, user: sessionPayload });
  } catch (err) {
    console.error('Error verifying Google token:', err);
    res.status(401).json({ error: 'Error al verificar el token de Google' });
  }
});

/**
 * GET /admin-api/auth/me
 * Devuelve la información del usuario autenticado.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session });
});

/**
 * POST /admin-api/auth/logout
 * El JWT se invalida en cliente eliminándolo; no necesita
 * estado en servidor. Este endpoint es solo para consistencia.
 */
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

export default router;
