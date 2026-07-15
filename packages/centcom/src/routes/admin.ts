import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireRole, signImpersonation } from '../auth';
import { h, body } from '../helpers';
import { admin, prisma, forceComplete, forceCancel, recordStaffCredential, getStaffCredentials, logEvent, listAuditEvents } from '../core';
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
// CIC "Brain" — one intelligence snapshot (health, pulse, anomalies, demand, recommendations, risk).
adminRouter.get('/brain', h(async (_req, res) => res.json(await admin.computeBrain())));

// ---- CENTCOM (owner master view) ----
adminRouter.get('/registry', h(async (_req, res) => res.json({ accounts: await admin.allAccounts() })));
// Live audit log (CIC data/info store) — every recorded change, newest first.
adminRouter.get('/audit', h(async (_req, res) => res.json({ events: await listAuditEvents(1000) })));
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
adminRouter.delete('/users/:id', h(async (req, res) => {
  const r = await admin.deleteAccount(req.params.id);
  logEvent(req.user!.sub, 'account.deleted', r.deleted || req.params.id, 'account and all its records deleted');
  res.json(r);
}));

// Admin-set password: reset any account to a strong password, returned ONCE for the
// admin to copy. Still stored only as a bcrypt hash — no plaintext is persisted.
const genPassword = () => crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14).padEnd(14, 'x');
adminRouter.post('/users/:id/set-password', body(z.object({ password: z.string().min(8).optional() })), h(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) return res.status(404).json({ error: 'not_found' });
  const password = req.body.password || genPassword();
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: bcrypt.hashSync(password, 10) } });
  if (u.role === 'admin') recordStaffCredential(u.id, u.username, u.name, password); // owner/mods only
  logEvent(req.user!.sub, 'account.password_set', u.username, `password reset (${u.role})`);
  res.json({ ok: true, username: u.username, password });
}));

// Create a moderator (admin account) with an owner-set password (recorded to staff file).
adminRouter.post('/moderators', body(z.object({ username: z.string().min(3).max(64), name: z.string().min(2), password: z.string().min(8) })), h(async (req, res) => {
  const r = await admin.createModerator(req.body.username, req.body.name, req.body.password);
  logEvent(req.user!.sub, 'account.created', req.body.username, 'moderator granted CENTCOM access');
  res.json(r);
}));

// ---- Original CENTCOM terminal endpoints ----
adminRouter.get('/centcom-overview', h(async (_req, res) => res.json(await admin.centcomOverview())));
adminRouter.post('/register-worker', body(z.object({
  name: z.string().min(2), phone: z.string().optional(), trade: z.string().optional(), zone: z.string().optional(),
  nationalId: z.string().optional(), guarantorName: z.string().optional(), guarantorPhone: z.string().optional(),
  idPhoto: z.string().optional(), approve: z.boolean().optional(),
})), h(async (req, res) => {
  const r = await admin.registerWorker(req.body);
  logEvent(req.user!.sub, 'account.created', r.username, `worker onboarded (${req.body.trade || 'handyman'})`);
  res.json(r);
}));
adminRouter.post('/change-password', body(z.object({ old: z.string(), new: z.string().min(6) })), h(async (req, res) => {
  const r = await admin.changeOwnerPassword(req.user!.sub, req.body.old, req.body.new);
  logEvent(req.user!.sub, 'account.password_set', 'self', 'owner changed own password');
  res.json(r);
}));

// "Open as" — mint a short-lived token to log in as any account (no password needed/stored).
adminRouter.post('/users/:id/impersonate', h(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) return res.status(404).json({ error: 'not_found' });
  const token = signImpersonation({ sub: u.id, role: u.role, name: u.name }, req.user!.sub);
  res.json({ token, user: { id: u.id, role: u.role, name: u.name, username: u.username } });
}));

adminRouter.post('/workers/:id/verify', body(z.object({ status: z.enum(['pending', 'interviewed', 'trial', 'approved', 'rejected']) })), h(async (req, res) => {
  const r = await admin.setVerification(req.params.id, req.body.status);
  logEvent(req.user!.sub, 'worker.verification', req.params.id, `set to ${req.body.status}`);
  res.json(r);
}));
adminRouter.post('/workers/:id/suspend', body(z.object({ on: z.boolean() })), h(async (req, res) => {
  const r = await admin.setSuspended(req.params.id, req.body.on);
  logEvent(req.user!.sub, 'worker.suspended', req.params.id, req.body.on ? 'suspended' : 'reinstated');
  res.json(r);
}));
adminRouter.post('/topups/confirm', body(z.object({ ref: z.string() })), h(async (req, res) => {
  const r = await admin.confirmTopup(req.body.ref);
  logEvent(req.user!.sub, 'wallet.topup_confirmed', req.body.ref, 'top-up confirmed');
  res.json(r);
}));
adminRouter.post('/releases/approve', body(z.object({ jobId: z.string() })), h(async (req, res) => {
  const r = await admin.releaseHold(req.body.jobId, 'admin');
  logEvent(req.user!.sub, 'job.released', req.body.jobId, 'cancellation release approved by admin');
  res.json(r);
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
  logEvent(req.user!.sub, 'config.changed', req.body.key, `= ${req.body.value}`);
  res.json({ ok: true, config: await admin.getConfig() });
}));

adminRouter.post('/change-password', body(z.object({ oldPassword: z.string(), newPassword: z.string().min(6) })), h(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!u || !bcrypt.compareSync(req.body.oldPassword, u.passwordHash)) return res.status(401).json({ error: 'wrong_password' });
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: bcrypt.hashSync(req.body.newPassword, 10) } });
  res.json({ ok: true });
}));
