import { Router } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { getFirebaseAdmin } from '../lib/firebase-admin';

const router = Router();

/**
 * POST /admin-api/auth/google
 * Recibe un Firebase ID token, lo verifica con Firebase Admin SDK,
 * comprueba la whitelist y devuelve un JWT de sesion propio.
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: 'Falta el token de Firebase' });
    return;
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    res.status(500).json({ error: 'Firebase Auth no esta configurado en el servidor.' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(credential);
    const email = decoded.email ?? '';
    const name = decoded.name ?? decoded.email ?? '';
    const picture = decoded.picture ?? '';

    if (!email) {
      res.status(401).json({ error: 'Token de Firebase invalido' });
      return;
    }

    if (!config.whitelist.includes(email.toLowerCase())) {
      res.status(403).json({ error: 'Tu cuenta no tiene acceso al panel de administracion.' });
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
      // No critico si falla
    }

    const sessionPayload = {
      email,
      name,
      picture,
      stationName,
    };

    const token = jwt.sign(sessionPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.json({ token, user: sessionPayload });
  } catch (err) {
    console.error('Error verifying Firebase token:', err);
    res.status(401).json({ error: 'Error al verificar el token de Firebase' });
  }
});

/**
 * GET /admin-api/auth/me
 * Devuelve la informacion del usuario autenticado.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session });
});

/**
 * POST /admin-api/auth/logout
 * El JWT se invalida en cliente eliminandolo; no necesita
 * estado en servidor. Este endpoint es solo para consistencia.
 */
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

export default router;
