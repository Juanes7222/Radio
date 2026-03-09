import { Router } from 'express';
import { notifyFrontend } from '../websocket';


const router = Router();

router.get('/webhook/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/webhook/facebook', (req, res) => {
  const body = req.body;

  if (body.object !== 'page') return res.sendStatus(404);

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'live_videos') continue;

      const { status, permalink_url } = change.value;

      if (status === 'live') {
        console.log('Live iniciado:', permalink_url);
        notifyFrontend(permalink_url);
      }
    }
  }

  res.sendStatus(200); // siempre responder 200 rápido
});

export default router;