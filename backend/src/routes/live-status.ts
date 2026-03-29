import { Router } from 'express';
import { addSSEClient, getCurrentLiveUrl } from '../sse';

const router = Router();

// SSE endpoint for live status updates
router.get('/stream', (req, res) => {
  addSSEClient(res);
});

// REST endpoint for polling (fallback)
router.get('/', (_req, res) => {
  const url = getCurrentLiveUrl();
  res.json({
    active: url !== null,
    url: url,
  });
});

export default router;
