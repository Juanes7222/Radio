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
import bibleRouter from './routes/bible';
import swaggerFile from './swagger-output.json';
import { startScheduler } from './jobs/scheduler';
import locutorRouter from './routes/locutor';
import youtubeRouter from './routes/youtube';
import workerAdminRouter from './routes/workerAdmin';
import { startWorkerServer } from './workers/workerServer';
import { dispatchPendingJobs } from './jobs/jobDispatcher';
import { subscribeToAllConfiguredChannels } from './services/youtube/subscription.service';

const app = express();

startScheduler();

app.use(morgan('dev'));
app.use(helmet());
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
  })
);

app.use(
  '/admin-api/youtube/webhook',
  express.text({ type: 'application/atom+xml' }),
  express.text({ type: 'text/xml' }),
  express.text({ type: 'application/xml' })
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
app.use('/admin-api/locutor', locutorRouter);
app.use('/admin-api/youtube', youtubeRouter);
app.use('/api/bible', bibleRouter);
app.use('/admin-api/workers', workerAdminRouter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/admin-api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(config.port, async () => {
  console.log(`\n Backend corriendo en http://localhost:${config.port}`);
  console.log(`   Station ID : ${config.azuracast.stationId}`);
  console.log(`   AzuraCast  : ${config.azuracast.url}`);
  console.log(
    `   Whitelist  : ${config.whitelist.length ? config.whitelist.join(', ') : '  VACÍA'}\n`
  );

  startWorkerServer();

  setInterval(dispatchPendingJobs, parseInt(process.env.JOB_DISPATCH_INTERVAL_MS ?? '2000', 10));

  await subscribeToAllConfiguredChannels();
  setInterval(subscribeToAllConfiguredChannels, 20 * 60 * 60 * 1000);
});