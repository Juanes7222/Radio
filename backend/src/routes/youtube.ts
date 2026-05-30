import express, { Router } from 'express';
import { parseStringPromise } from 'xml2js';
import { processYouTubeVideoAsync } from '../services/youtubeProcessor.service';

const router = Router();


/**
 * GET /admin-api/youtube/webhook
 * Verificación WebSub de YouTube
 */
router.get('/webhook', (req, res) => {
  const challenge = req.query['hub.challenge'];

  if (!challenge || typeof challenge !== 'string') {
    res.status(400).send('Missing challenge');
    return;
  }

  console.log('[YouTube] Webhook verificado');

  res.status(200).send(challenge);
});

/**
 * POST /admin-api/youtube/webhook
 * Notificaciones de nuevos videos
 */
router.post(
  '/webhook',
  express.text({ type: '*/*' }),
  async (req, res) => {
    try {
      const rawXml =
        typeof req.body === 'string'
          ? req.body
          : req.body.toString();

      const parsed = await parseStringPromise(rawXml);

      const entry = parsed.feed?.entry?.[0];

      if (!entry) {
        console.log('[YouTube] Evento vacío');
        res.sendStatus(200);
        return;
      }

      const videoId = entry['yt:videoId']?.[0];
      const channelId = entry['yt:channelId']?.[0];
      const title = entry.title?.[0];
      const published = entry.published?.[0];

      if (!videoId || !channelId || !title) {
         res.sendStatus(200);
         return;
      }

      console.log('[YouTube] Nuevo webhook recibido');
      console.log({ videoId, channelId, title, published });

      // Desencadena el procesamiento en segundo plano (no bloqueamos la respuesta Webhook)
      processYouTubeVideoAsync(videoId, title, channelId).catch(console.error);

      res.sendStatus(200);
    } catch (err) {
      console.error(
        '[YouTube] Error webhook:',
        err
      );

      res.sendStatus(500);
    }
  }
);

export default router;