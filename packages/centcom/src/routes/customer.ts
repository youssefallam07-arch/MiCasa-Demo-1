import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth';
import { h, body } from '../helpers';
import { postJob, myJobsCustomer, listBidsForJob, acceptBid, confirmComplete, releaseHold, rate, prisma } from '../core';

export const customerRouter = Router();
customerRouter.use(requireRole('customer'));

customerRouter.post('/jobs', body(z.object({
  trade: z.string(), description: z.string().min(3), zone: z.string(),
  budgetOfferPst: z.number().int().positive(), urgency: z.enum(['standard', 'priority']).default('standard'),
  photos: z.array(z.string()).optional(),
})), h(async (req, res) => {
  const job = await postJob(req.user!.sub, req.body);
  res.json({ ok: true, job });
}));

customerRouter.get('/jobs', h(async (req, res) => {
  res.json({ jobs: await myJobsCustomer(req.user!.sub) });
}));

customerRouter.get('/jobs/:id/bids', h(async (req, res) => {
  res.json({ bids: await listBidsForJob(req.user!.sub, req.params.id) });
}));

customerRouter.post('/jobs/:id/accept', body(z.object({ bidId: z.string() })), h(async (req, res) => {
  res.json(await acceptBid(req.user!.sub, req.params.id, req.body.bidId));
}));

customerRouter.post('/jobs/:id/confirm-complete', h(async (req, res) => {
  res.json(await confirmComplete(req.user!.sub, req.params.id));
}));

// customer confirms the worker's cancellation -> releases the commission hold
customerRouter.post('/jobs/:id/confirm-cancel', h(async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job || job.customerId !== req.user!.sub) return res.status(403).json({ error: 'not_your_job' });
  res.json(await releaseHold(req.params.id, 'customer'));
}));

customerRouter.post('/jobs/:id/rate', body(z.object({ stars: z.number().int().min(1).max(5), comment: z.string().optional() })), h(async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job || job.customerId !== req.user!.sub) return res.status(403).json({ error: 'not_your_job' });
  if (!job.acceptedWorkerId) return res.status(409).json({ error: 'no_worker' });
  res.json(await rate(req.user!.sub, req.params.id, job.acceptedWorkerId, req.body.stars, req.body.comment));
}));
