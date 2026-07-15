import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth';
import { h, body } from '../helpers';
import { listOpenJobsFor, submitBid, myJobsWorker, markComplete, cancelByWorker, accountView, requestTopup, rate, prisma } from '../core';

export const workerRouter = Router();
workerRouter.use(requireRole('worker'));

// Owner superuser: an admin browsing the Workers app has no worker profile by
// default, which would break the feed/wallet. Lazily provision one (approved,
// prepaid) the first time. Worker listings filter on user.role='worker', so the
// admin never pollutes the marketplace or verification queue.
workerRouter.use((req, res, next) => {
  if (req.user!.role !== 'admin') return next();
  (async () => {
    const existing = await prisma.workerProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!existing) {
      await prisma.workerProfile.create({ data: { userId: req.user!.sub, trade: 'handyman', zone: 'المعادي', verificationStatus: 'approved', walletMode: 'prepaid' } }).catch(() => {});
      await prisma.serviceCreditAccount.create({ data: { workerId: req.user!.sub } }).catch(() => {});
    }
    next();
  })().catch(next);
});

workerRouter.get('/me', h(async (req, res) => {
  const wp = await prisma.workerProfile.findUnique({ where: { userId: req.user!.sub } });
  res.json({ profile: wp });
}));

workerRouter.get('/feed', h(async (req, res) => {
  res.json({ jobs: await listOpenJobsFor(req.user!.sub) });
}));

workerRouter.post('/bids', body(z.object({ jobId: z.string(), pricePst: z.number().int().positive(), etaMin: z.number().int().positive() })), h(async (req, res) => {
  res.json(await submitBid(req.user!.sub, req.body.jobId, req.body.pricePst, req.body.etaMin));
}));

workerRouter.get('/jobs', h(async (req, res) => {
  res.json({ jobs: await myJobsWorker(req.user!.sub) });
}));

workerRouter.post('/jobs/:id/complete', h(async (req, res) => {
  res.json(await markComplete(req.user!.sub, req.params.id));
}));

workerRouter.post('/jobs/:id/cancel', body(z.object({ contacted: z.boolean().default(false) })), h(async (req, res) => {
  res.json(await cancelByWorker(req.user!.sub, req.params.id, req.body.contacted));
}));

workerRouter.get('/wallet', h(async (req, res) => {
  res.json(await accountView(req.user!.sub));
}));

workerRouter.post('/wallet/topup', body(z.object({ amountPst: z.number().int().positive(), method: z.string() })), h(async (req, res) => {
  res.json(await requestTopup(req.user!.sub, req.body.amountPst, req.body.method));
}));

workerRouter.post('/jobs/:id/rate', body(z.object({ stars: z.number().int().min(1).max(5), comment: z.string().optional() })), h(async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job || job.acceptedWorkerId !== req.user!.sub) return res.status(403).json({ error: 'not_your_job' });
  res.json(await rate(req.user!.sub, req.params.id, job.customerId, req.body.stars, req.body.comment));
}));
