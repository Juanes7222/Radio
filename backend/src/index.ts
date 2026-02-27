import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import authRouter from './routes/auth';
import proxyRouter from './routes/proxy';
import uploadRouter from './routes/upload';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: [
      'http://localhost:5173', // Vite dev
      'http://localhost:4173', // Vite preview
      process.env.FRONTEND_URL ?? '',
    ].filter(Boolean),
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/admin-api/auth', authRouter);
app.use('/admin-api', proxyRouter);
app.use('/admin-api/upload', uploadRouter);

app.get('/admin-api/health', (_req, res) => {
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
