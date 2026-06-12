import { Router, type Request, type Response } from 'express';
import axios, { type AxiosRequestConfig, type Method } from 'axios';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const router = Router();

async function proxyToAzuraCast(
  req: Request,
  res: Response,
  azuracastPath: string,
  transform?: (data: unknown) => unknown
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

    // Si hay credenciales Basic Auth en la URL (para saltar protección del Nginx en panel.*)
    try {
      const urlObj = new URL(axiosConfig.url!);
      if (urlObj.username && urlObj.password) {
        axiosConfig.auth = {
          username: urlObj.username,
          password: urlObj.password,
        };
        // Limpiamos las credenciales de la URL por limpieza visual de Axios
        urlObj.username = '';
        urlObj.password = '';
        axiosConfig.url = urlObj.toString();
      }
    } catch(e) {}

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length) {
      axiosConfig.data = req.body;
    }

    const response = await axios(axiosConfig);
    const body = transform ? transform(response.data) : response.data;
    res.status(response.status).json(body);
  } catch (err: any) {
    if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.warn('AzuraCast not available (ECONNRESET/ECONNREFUSED), redirecting to 502...');
      res.status(502).json({ error: 'AzuraCast not available yet' });
      return;
    }

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

// Public routes — no authentication required
export const publicRouter = Router();

function buildPublicUrl(req: Request): string {
  const host = req.headers['x-forwarded-host'] ?? req.headers['host'] ?? '';
  const protocol = req.headers['x-forwarded-proto'] ?? 'https';
  return `${protocol}://${host}`;
}

const SCHEDULE_EXCLUSIONS = ['CONTENIDO VARIADO', 'MUSICA', 'JINGLES', 'JINGLE'];

function filterSchedule(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.filter((item: any) => {
    const title = item?.title ?? '';
    const normalized = title.toLowerCase();
    return !SCHEDULE_EXCLUSIONS.some(ex => normalized.includes(ex.toLowerCase()));
  });
}

function rewriteInternalUrls(data: unknown, publicUrl: string): unknown {
  const azuraUrl = config.azuracast.url; 
  
  let rewritten = JSON.stringify(data)
    .replaceAll('http://localhost:8080', publicUrl)
    .replaceAll('http://localhost', publicUrl)
    .replaceAll('https://localhost', publicUrl)
    .replaceAll('http://127.0.0.1:8080', publicUrl)
    .replaceAll('http://127.0.0.1', publicUrl);
    
  try {
    const parsedAzura = new URL(azuraUrl);
    const azuraHost = `${parsedAzura.protocol}//${parsedAzura.host}`;
    
    rewritten = rewritten.replaceAll(`${azuraHost}/api/`, `${publicUrl}/api/`);
    
    if (azuraHost.includes('panel.')) {
      const publicDomain = azuraHost.replace('panel.', 'www.');
      rewritten = rewritten.replaceAll(`${azuraHost}/listen/`, `${publicDomain}/listen/`);
      rewritten = rewritten.replaceAll(`${azuraHost}/public/`, `${publicDomain}/public/`);
      rewritten = rewritten.replaceAll(`${azuraHost}/static/`, `${publicDomain}/static/`);
      rewritten = rewritten.replaceAll(`${azuraHost}/api/station/la_voz_de_la_verdad/art/`, `${publicDomain}/api/station/la_voz_de_la_verdad/art/`);
    }

  } catch (e) {
    // Fallback if parsing fails
    rewritten = rewritten.replaceAll(`${azuraUrl}/api/`, `${publicUrl}/api/`);
  }
  
  return JSON.parse(rewritten);
}
publicRouter.get('/nowplaying', (req, res) => {
  const publicUrl = buildPublicUrl(req);
  proxyToAzuraCast(req, res, `/api/nowplaying/${config.azuracast.stationId}`, 
    (data) => rewriteInternalUrls(data, publicUrl));
});

publicRouter.get('/search', (req, res) => {
  const publicUrl = buildPublicUrl(req);
  proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/requests`, 
    (data) => rewriteInternalUrls(data, publicUrl));
});

publicRouter.get('/schedule', (req, res) => {
  const publicUrl = buildPublicUrl(req);
  proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/schedule`,
    (data) => rewriteInternalUrls(filterSchedule(data), publicUrl));
});

publicRouter.get('/station/:stationId/art/:artId', async (req, res) => {
  const { stationId, artId } = req.params;
  try {
    const azuraCastResponse = await axios({
      method: 'GET',
      url: `${config.azuracast.url}/api/station/${stationId}/art/${artId}`,
      headers: { Authorization: `Bearer ${config.azuracast.apiKey}` },
      responseType: 'stream',
      timeout: 15000,
    });
    const contentType = azuraCastResponse.headers['content-type'];
    res.setHeader('Content-Type', typeof contentType === 'string' ? contentType : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    azuraCastResponse.data.pipe(res);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      res.status(err.response.status).send();
    } else {
      res.status(502).send();
    }
  }
});

publicRouter.post('/requests/:songId', (req, res) => {
  const { songId } = req.params;
  const publicUrl = buildPublicUrl(req);
  proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/request/${songId}`, 
    (data) => rewriteInternalUrls(data, publicUrl));
});
