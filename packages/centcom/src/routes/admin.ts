import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireRole } from '../auth';
import { h, body } from '../helpers';
import { admin, prisma } from '../core';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

adminRouter.get('/dashboard', h(async (_req, res) => res.json(await admin.dashboard())));
adminRouter.get('/workers', h(async (_req, res) => res.json({ workers: await admin.listWorkers() })));
adminRouter.get('/verification-queue', h(async (_req, res) => res.json({ workers: await admin.verificationQueue() })));
adminRouter.get('/wallets', h(async (_req, res) => res.json(await admin.walletsOverview())));
adminRouter.get('/topups', h(async (_req, res) => res.json({ topups: await admin.pendingTopups() })));
adminRouter.get('/releases', h(async (_req, res) => res.json({ releases: await admin.pendingReleases() })));
adminRouter.get('/jobs', h(async (_req, res) => res.json({ jobs: await admin.jobsTable() })));
adminRouter.get('/config', h(async (_req, res) => res.json({ config: await admin.getConfig() })));

adminRouter.post('/workers/:id/verify', body(z.object({ status: z.enum(['pending', 'interviewed', 'trial', 'approved', 'rejected']) })), h(async (req, res) => {
  res.json(await admin.setVerification(req.params.id, req.body.status));
}));
adminRouter.post('/workers/:id/suspend', body(z.object({ on: z.boolean() })), h(async (req, res) => {
  res.json(await admin.setSuspended(req.params.id, req.body.on));
}));
adminRouter.post('/topups/confirm', body(z.object({ ref: z.string() })), h(async (req, res) => {
  res.json(await admin.confirmTopup(req.body.ref));
}));
adminRouter.post('/releases/approve', body(z.object({ jobId: z.string() })), h(async (req, res) => {
  res.json(await admin.releaseHold(req.body.jobId, 'admin'));
}));
adminRouter.post('/config', body(z.object({ key: z.string(), value: z.string() })), h(async (req, res) => {
  await admin.setConfig(req.body.key, req.body.value);
  res.json({ ok: true, config: await admin.getConfig() });
}));

adminRouter.post('/change-password', body(z.object({ oldPassword: z.string(), newPassword: z.string().min(6) })), h(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!u || !bcrypt.compareSync(req.body.oldPassword, u.passwordHash)) return res.status(401).json({ error: 'wrong_password' });
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: bcrypt.hashSync(req.body.newPassword, 10) } });
  res.json({ ok: true });
}));
