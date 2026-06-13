import dotenv from 'dotenv';
import { initializeInfisicalSecrets } from './infisical';

dotenv.config();

async function bootstrap() {
  const infisicalInitialized = await initializeInfisicalSecrets();
  if (infisicalInitialized) {
    console.log('[Infisical] Secrets loaded successfully');
  } else {
    console.log('[Infisical] Not configured or failed. Using local .env only.');
  }

  const express = await import('express');
  const { default: cors } = await import('cors');
  const { default: helmet } = await import('helmet');
  const { default: morgan } = await import('morgan');
  const { default: swaggerUi } = await import('swagger-ui-express');
  const { config } = await import('./config');
  const { default: authRouter } = await import('./routes/auth');
  const { default: proxyRouter, publicRouter } = await import('./routes/proxy');
  const { default: uploadRouter } = await import('./routes/upload');
  const { default: webhookRouter } = await import('./routes/webhook');
  const { default: panelRouter } = await import('./routes/panel');
  const { default: liveStatusRouter } = await import('./routes/live-status');
  const { default: bibleRouter } = await import('./routes/bible');
  const { default: swaggerFile } = await import('./swagger-output.json');
  const { startScheduler } = await import('./jobs/scheduler');
  const { default: locutorRouter } = await import('./routes/locutor');
  const { default: youtubeRouter } = await import('./routes/youtube');
  const { default: workerAdminRouter } = await import('./routes/workerAdmin');
  const { default: prayerRouter } = await import('./routes/prayer');
  const { startWorkerServer } = await import('./workers/workerServer');
  const { dispatchPendingJobs } = await import('./jobs/jobDispatcher');
  const { subscribeToAllConfiguredChannels } = await import('./services/youtube/subscription.service');

  const app = express.default();

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
    express.default.text({ type: 'application/atom+xml' }),
    express.default.text({ type: 'text/xml' }),
    express.default.text({ type: 'application/xml' })
  );

  app.use(express.default.json());
  app.use(express.default.urlencoded({ extended: true }));

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
  app.use('/api/prayer', prayerRouter);

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get('/admin-api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  const server = app.listen(config.port, async () => {
    console.log(`\n Backend corriendo en http://localhost:${config.port}`);
    console.log(`   Station ID : ${config.azuracast.stationId}`);
    console.log(`   AzuraCast  : ${config.azuracast.url}`);
    console.log(
      `   Whitelist  : ${config.whitelist.length ? config.whitelist.join(', ') : '  VACÍA'}\n`
    );

    startWorkerServer();

    setInterval(dispatchPendingJobs, config.jobDispatchIntervalMs);

    await subscribeToAllConfiguredChannels();
    setInterval(subscribeToAllConfiguredChannels, 20 * 60 * 60 * 1000);
  });

  server.timeout = 600_000;
  server.keepAliveTimeout = 600_000;
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});