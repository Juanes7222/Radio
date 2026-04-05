import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import authRouter from './routes/auth';
import proxyRouter, { publicRouter } from './routes/proxy';
import uploadRouter from './routes/upload';
import webhookRouter from './routes/webhook';
import panelRouter from './routes/panel';
import liveStatusRouter from './routes/live-status';
import swaggerFile from './swagger-output.json';

const app = express();

app.use(morgan('dev'));
app.use(helmet());
app.use(
    cors({
        origin: [
            'http://localhost:5173',
            'http://localhost:4173',
        ],  
        credentials: true,
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', publicRouter);
app.use('/admin-api/auth', authRouter);
app.use('/admin-api', proxyRouter);
app.use('/admin-api/upload', uploadRouter);
app.use('/webhook', webhookRouter);
app.use('/panel-api', panelRouter);
app.use('/live-status', liveStatusRouter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.get('/admin-api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(config.port, () => {
    console.log(`\n Backend admin corriendo en http://localhost:${config.port}`);
    console.log(`   Station ID : ${config.azuracast.stationId}`);
    console.log(`   AzuraCast  : ${config.azuracast.url}`);
    console.log(
        `   Whitelist  : ${config.whitelist.length ? config.whitelist.join(', ') : '  VACÍA — nadie puede entrar'}\n`
    );
});