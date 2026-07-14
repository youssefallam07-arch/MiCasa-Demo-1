import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV } from './env';
import { authenticate } from './auth';
import { errorHandler } from './helpers';
import { authRouter } from './routes/auth';
import { customerRouter } from './routes/customer';
import { workerRouter } from './routes/worker';
import { adminRouter } from './routes/admin';
import { landingHtml } from './landing';

const here = path.dirname(fileURLToPath(import.meta.url));
const appsDir = path.resolve(here, '../../../apps');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(authenticate);

app.get('/health', (_req, res) => res.json({ ok: true, service: 'centcom' }));

// ---- API under /api (so app paths like /customer don't collide) ----
app.use('/api/auth', authRouter);
app.use('/api/customer', customerRouter);
app.use('/api/worker', workerRouter);
app.use('/api/admin', adminRouter);

// ---- serve the three built apps (run `npm run build:apps` first) ----
for (const a of ['customer', 'workers', 'cic', 'centcom']) {
  const dist = path.join(appsDir, a, 'dist');
  app.use(`/${a}`, express.static(dist));
  app.get(`/${a}`, (_req, res) => res.redirect(`/${a}/`)); // no-slash -> slash
}

// ---- landing page: one menu to open every app, with test logins ----
app.get('/', (_req, res) => res.type('html').send(landingHtml()));

app.use(errorHandler);

app.listen(ENV.PORT, () => {
  console.log(`[centcom] API + apps on http://localhost:${ENV.PORT}`);
});
