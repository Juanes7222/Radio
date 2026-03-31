import { Router } from 'express';
import { addSSEClient, getCurrentLiveUrl } from '../sse';

const router = Router();

router.get('/stream', (req, res) => {
  addSSEClient(res);
});

router.get('/', (_req, res) => {
  const url = getCurrentLiveUrl();
  res.json({
    active: url !== null,
    url: url,
  });
});

export default router;
