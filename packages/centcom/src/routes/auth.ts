import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../core';
import { signToken, requireRole } from '../auth';
import { h, body } from '../helpers';

export const authRouter = Router();

const registerSchema = z.object({
  role: z.enum(['customer', 'worker']),
  username: z.string().min(3).max(30),
  password: z.string().min(6),
  name: z.string().min(2),
  phone: z.string().optional(),
  trade: z.string().optional(),
  zone: z.string().optional(),
});

authRouter.post('/register', body(registerSchema), h(async (req, res) => {
  const { role, username, password, name, phone, trade, zone } = req.body;
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: 'username_taken' });
  const user = await prisma.user.create({ data: { role, username, name, phone: phone ?? null, passwordHash: bcrypt.hashSync(password, 10) } });
  if (role === 'worker') {
    await prisma.workerProfile.create({ data: { userId: user.id, trade: trade || 'handyman', zone: zone || 'المعادي', verificationStatus: 'pending', walletMode: 'postpaid' } });
    await prisma.serviceCreditAccount.create({ data: { workerId: user.id } });
  }
  const token = signToken({ sub: user.id, role: user.role, name: user.name });
  res.json({ ok: true, token, user: { id: user.id, role: user.role, name: user.name } });
}));

authRouter.post('/login', body(z.object({ username: z.string(), password: z.string() })), h(async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'invalid_credentials' });
  const token = signToken({ sub: user.id, role: user.role, name: user.name });
  res.json({ ok: true, token, user: { id: user.id, role: user.role, name: user.name } });
}));

authRouter.get('/me', requireRole('customer', 'worker', 'admin'), (req, res) => {
  res.json({ user: req.user });
});
