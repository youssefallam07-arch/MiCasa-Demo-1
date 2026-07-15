import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import { autoCaptureStale, recomputeAllRatings } from './core';

const here = path.dirname(fileURLToPath(import.meta.url));
const appsDir = path.resolve(here, '../../../apps');

const app = express();
app.set('trust proxy', 1); // behind the cloudflared tunnel — needed for per-IP rate limiting
app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
}));
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ENV.CORS_ORIGINS.includes(origin)),
}));
app.use(express.json({ limit: '2mb' }));
app.use(authenticate);

app.get('/health', (_req, res) => res.json({ ok: true, service: 'centcom' }));

// Brute-force guard: only FAILED attempts count (skipSuccessfulRequests), so
// normal sign-ins are unaffected while credential guessing hits 429 fast.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  skip: (req) => req.method === 'GET', // /me etc.
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

// ---- API under /api (so app paths like /customer don't collide) ----
app.use('/api/auth', authLimiter, authRouter);
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
  // Backfill rating aggregates once, then auto-capture stale worker_done jobs on boot + hourly.
  recomputeAllRatings().catch((e) => console.error('[centcom] rating backfill failed:', e?.message || e));
  const sweep = () => autoCaptureStale()
    .then((r) => { if (r.captured) console.log(`[centcom] auto-captured ${r.captured} stale job(s)`); })
    .catch((e) => console.error('[centcom] auto-capture failed:', e?.message || e));
  sweep();
  setInterval(sweep, 60 * 60 * 1000);
});
