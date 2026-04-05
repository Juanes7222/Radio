import { Router, type Request, type Response, type NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

function requirePanelSecret(req: Request, res: Response, next: NextFunction): void {
    if (req.headers['x-panel-secret'] !== config.panelSecret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}

router.use(requirePanelSecret);

router.get('/status', async (_req, res) => {
    try {
        const [nowPlayingRes, streamerRes] = await Promise.all([
            axios.get(
                `${config.azuracast.url}/api/nowplaying/${config.azuracast.stationId}`,
                { headers: { Authorization: `Bearer ${config.azuracast.apiKey}` }, timeout: 5000 }
            ),
            axios.get(
                `${config.azuracast.url}/api/station/${config.azuracast.stationId}/streamers`,
                { headers: { Authorization: `Bearer ${config.azuracast.apiKey}` }, timeout: 5000 }
            ),
        ]);

        const np = nowPlayingRes.data;

        res.json({
            isLive:        np.live?.is_live ?? false,
            streamerName:  np.live?.streamer_name ?? null,
            currentSong:   np.now_playing?.song?.title ?? null,
            currentArtist: np.now_playing?.song?.artist ?? null,
            listeners:     np.listeners?.current ?? 0,
            autoDjEnabled: np.station?.backend_type !== 'none',
        });
    } catch (err: any) {
        if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            console.warn('AzuraCast no disponible (ECONNRESET/ECONNREFUSED) en panel de status, abortando tick de forma segura.');
            res.status(502).json({ error: 'AzuraCast no disponible' });
            return;
        }
        
        if (axios.isAxiosError(err) && err.response) {
            res.status(err.response.status).json(err.response.data);
        } else {
            res.status(502).json({ error: 'No se pudo conectar con AzuraCast' });
        }
    }
});

router.post('/autodj/stop', async (_req, res) => {
    try {
        await axios.post(
            `${config.azuracast.url}/api/station/${config.azuracast.stationId}/backend/stop-autodj`,
            {},
            { headers: { Authorization: `Bearer ${config.azuracast.apiKey}` }, timeout: 10000 }
        );
        res.json({ ok: true });
    } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
            res.status(err.response.status).json(err.response.data);
        } else {
            res.status(502).json({ error: 'Error al detener AutoDJ' });
        }
    }
});

router.post('/autodj/start', async (_req, res) => {
    try {
        await axios.post(
            `${config.azuracast.url}/api/station/${config.azuracast.stationId}/backend/start-autodj`,
            {},
            { headers: { Authorization: `Bearer ${config.azuracast.apiKey}` }, timeout: 10000 }
        );
        res.json({ ok: true });
    } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
            res.status(err.response.status).json(err.response.data);
        } else {
            res.status(502).json({ error: 'Error al iniciar AutoDJ' });
        }
    }
});

export default router;
