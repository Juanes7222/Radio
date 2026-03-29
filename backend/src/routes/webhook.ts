import { Router } from 'express';
import { notifyLiveStart, notifyLiveEnd } from '../sse';

const router = Router();

router.get('/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/facebook', (req, res) => {
  const body = req.body;

  // Always respond 200 immediately to Facebook
  res.sendStatus(200);

  // Process webhook safely
  try {
    if (body?.object !== 'page') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        if (change?.field !== 'live_videos') continue;

        const value = change.value || {};
        const { status, permalink_url } = value;

        if (status === 'live' && permalink_url) {
          console.log('Live iniciado:', permalink_url);
          notifyLiveStart(permalink_url);
        } else if (status === 'live_stopped' || status === 'vod') {
          console.log('Live detenido');
          notifyLiveEnd();
        }
      }
    }
  } catch (error) {
    console.error('Error processing Facebook webhook:', error);
  }
});

export default router;