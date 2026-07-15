import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireRole, signImpersonation } from '../auth';
import { h, body } from '../helpers';
import { admin, prisma, forceComplete, forceCancel } from '../core';
import { buildRegistryWorkbook } from '../registry-xlsx';

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

// ---- CENTCOM (owner master view) ----
adminRouter.get('/registry', h(async (_req, res) => res.json({ accounts: await admin.allAccounts() })));
adminRouter.get('/overview', h(async (_req, res) => res.json(await admin.platformOverview())));
// Live Excel export — built fresh from the DB on every request (a current snapshot, never cached).
adminRouter.get('/registry.xlsx', h(async (_req, res) => {
  const wb = await buildRegistryWorkbook();
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="micasa-registry-${stamp}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));
adminRouter.delete('/users/:id', h(async (req, res) => res.json(await admin.deleteAccount(req.params.id))));

// Admin-set password: reset any account to a strong password, returned ONCE for the
// admin to copy. Still stored only as a bcrypt hash — no plaintext is persisted.
const genPassword = () => crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14).padEnd(14, 'x');
adminRouter.post('/users/:id/set-password', body(z.object({ password: z.string().min(8).optional() })), h(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) return res.status(404).json({ error: 'not_found' });
  const password = req.body.password || genPassword();
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: bcrypt.hashSync(password, 10) } });
  res.json({ ok: true, username: u.username, password });
}));

// "Open as" — mint a short-lived token to log in as any account (no password needed/stored).
adminRouter.post('/users/:id/impersonate', h(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) return res.status(404).json({ error: 'not_found' });
  const token = signImpersonation({ sub: u.id, role: u.role, name: u.name }, req.user!.sub);
  res.json({ token, user: { id: u.id, role: u.role, name: u.name, username: u.username } });
}));

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

// Admin overrides for stuck jobs — a reason is required and lands in the money ledger.
adminRouter.post('/jobs/:id/force-complete', body(z.object({ note: z.string().min(3) })), h(async (req, res) => {
  res.json(await forceComplete(req.params.id, req.body.note));
}));
adminRouter.post('/jobs/:id/force-cancel', body(z.object({ note: z.string().min(3) })), h(async (req, res) => {
  res.json(await forceCancel(req.params.id, req.body.note));
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
