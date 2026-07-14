import express from 'express';
import cors from 'cors';
import { ENV } from './env';
import { authenticate } from './auth';
import { errorHandler } from './helpers';
import { authRouter } from './routes/auth';
import { customerRouter } from './routes/customer';
import { workerRouter } from './routes/worker';
import { adminRouter } from './routes/admin';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(authenticate); // attaches req.user if a valid token is present

app.get('/health', (_req, res) => res.json({ ok: true, service: 'centcom' }));

// role-scoped route trees — the ONLY gateway to the mainframe
app.use('/auth', authRouter);
app.use('/customer', customerRouter);
app.use('/worker', workerRouter);
app.use('/admin', adminRouter);

app.use(errorHandler);

app.listen(ENV.PORT, () => {
  console.log(`[centcom] API listening on http://localhost:${ENV.PORT}`);
});
