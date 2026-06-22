import { Router, type Request, type Response } from 'express';
import axios, { type AxiosRequestConfig, type Method } from 'axios';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const router = Router();

async function fetchFromAzuraCast(
  req: Request,
  azuracastPath: string,
  transform?: (data: unknown) => unknown,
  customParams?: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const axiosConfig: AxiosRequestConfig = {
    method: req.method as Method,
    url: `${config.azuracast.url}${azuracastPath}`,
    headers: {
      Authorization: `Bearer ${config.azuracast.apiKey}`,
      'Content-Type': req.headers['content-type'] ?? 'application/json',
    },
    params: { ...req.query, ...customParams },
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
  return { status: response.status, data: body };
}

async function proxyToAzuraCast(
  req: Request,
  res: Response,
  azuracastPath: string,
  transform?: (data: unknown) => unknown
): Promise<void> {
  try {
    const { status, data } = await fetchFromAzuraCast(req, azuracastPath, transform);
    res.status(status).json(data);
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

router.post('/station/nowplaying/update', requireAuth, (req, res) => {
    proxyToAzuraCast(req, res, `/api/station/${config.azuracast.stationId}/nowplaying/update`);
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

function getBogotaDateString(daysOffset = 0): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const now = new Date();
  const target = new Date(now);
  target.setDate(now.getDate() + daysOffset);

  return formatter.format(target);
}

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

  // Replace any localhost/127.0.0.1 reference regardless of protocol or port
  let rewritten = JSON.stringify(data)
    .replace(/https?:\/\/localhost(:\d+)?/g, publicUrl)
    .replace(/https?:\/\/127\.0\.0\.1(:\d+)?/g, publicUrl);

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

type SongRequest = {
  request_id: string;
  song: {
    title: string;
    artist: string;
    art?: string;
  };
};

const REQUESTS_CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutos

let requestsCache: {
  data: SongRequest[];
  expiresAt: number;
} | null = null;

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function getAllRequestableSongs(
  req: Request,
  publicUrl: string,
): Promise<SongRequest[]> {
  if (
    requestsCache &&
    requestsCache.expiresAt > Date.now()
  ) {
    return requestsCache.data;
  }

  const allSongs: SongRequest[] = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const { data } = await fetchFromAzuraCast(
      req,
      `/api/station/${config.azuracast.stationId}/requests`,
      (d) => rewriteInternalUrls(d, publicUrl),
      {
        page,
        per_page: perPage,
      },
    );

    const batch = Array.isArray(data)
      ? (data as SongRequest[])
      : [];

    allSongs.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page++;
  }

  const uniqueSongs = Array.from(
    new Map(
      allSongs.map(song => [song.request_id, song]),
    ).values(),
  );

  requestsCache = {
    data: uniqueSongs,
    expiresAt: Date.now() + REQUESTS_CACHE_TTL_MS,
  };

  return uniqueSongs;
}

publicRouter.get('/nowplaying', async (req, res) => {
  const publicUrl = buildPublicUrl(req);
  try {
    const { status, data } = await fetchFromAzuraCast(
      req,
      `/api/nowplaying/${config.azuracast.stationId}`,
      (d) => rewriteInternalUrls(d, publicUrl)
    );
    if (status === 404) {
      return res.status(200).json({
        station: null,
        listeners: { total: 0, unique: 0, current: 0 },
        live: { is_live: false, streamer_name: null, broadcast_start: null, art: null },
        now_playing: null,
        playing_next: null,
        song_history: [],
      });
    }
    res.status(status).json(data);
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
});

publicRouter.get('/search', async (req, res) => {
  const publicUrl = buildPublicUrl(req);

  try {
    const page = Math.max(
      1,
      Number(req.query.page ?? 1),
    );

    const perPage = Math.min(
      100,
      Math.max(
        1,
        Number(req.query.per_page ?? 25),
      ),
    );

    const search = normalizeSearch(
      String(req.query.search ?? ''),
    );

    const allSongs = await getAllRequestableSongs(
      req,
      publicUrl,
    );

    const filteredSongs = !search
      ? allSongs
      : allSongs.filter((item) => {
          const haystack = normalizeSearch(
            [
              item.song?.title ?? '',
              item.song?.artist ?? '',
            ].join(' '),
          );

          return haystack.includes(search);
        });

    const start = (page - 1) * perPage;
    const end = start + perPage;

    res.status(200).json(
      filteredSongs.slice(start, end),
    );
  } catch (err: any) {
    if (
      err.code === 'ECONNRESET' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND'
    ) {
      return res.status(502).json({
        error: 'AzuraCast not available yet',
      });
    }

    if (axios.isAxiosError(err) && err.response) {
      return res
        .status(err.response.status)
        .json(err.response.data);
    }

    console.error('Search error:', err);

    return res.status(502).json({
      error: 'Error de conexión con AzuraCast',
    });
  }
});

publicRouter.get('/schedule', (req, res) => {
  const publicUrl = buildPublicUrl(req);

  if (!req.query.start || !req.query.end) {
    req.query.start = getBogotaDateString(0);
    req.query.end = getBogotaDateString(6);
  }

  proxyToAzuraCast(
    req,
    res,
    `/api/station/${config.azuracast.stationId}/schedule`,
    (data) => rewriteInternalUrls(filterSchedule(data), publicUrl)
  );
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
