import { Router, type Request, type Response } from 'express';
import axios, { type AxiosRequestConfig, type Method } from 'axios';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const router = Router();

async function proxyToAzuraCast(
  req: Request,
  res: Response,
  azuracastPath: string
): Promise<void> {
  try {
    const axiosConfig: AxiosRequestConfig = {
      method: req.method as Method,
      url: `${config.azuracast.url}${azuracastPath}`,
      headers: {
        Authorization: `Bearer ${config.azuracast.apiKey}`,
        'Content-Type': req.headers['content-type'] ?? 'application/json',
      },
      params: req.query,
      timeout: 15000,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length) {
      axiosConfig.data = req.body;
    }

    const response = await axios(axiosConfig);
    res.status(response.status).json(response.data);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      console.error('Proxy error:', err);
      res.status(502).json({ error: 'Error de conexión con AzuraCast' });
    }
  }
}

router.all('/station/*', requireAuth, (req, res) => {
  const path = (req.params as Record<string, string>)[0] ?? '';
  proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/${path}`);
});

router.get('/nowplaying', requireAuth, (req, res) => {
  proxyToAzuraCast(req, res, `/api/nowplaying/${config.azuracast.stationId}`);
});

export default router;
