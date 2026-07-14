import { prisma } from './db';
import { getConfig } from './config';
import { err } from './errors';
import { computeCommissionPst, checkCoverage } from './credit';

// ---- Jobs ----
export async function postJob(customerId: string, d: {
  trade: string; description: string; zone: string; budgetOfferPst: number; urgency: string; photos?: string[];
}) {
  return prisma.job.create({
    data: {
      customerId, trade: d.trade, description: d.description, zone: d.zone,
      budgetOfferPst: d.budgetOfferPst, urgency: d.urgency === 'priority' ? 'priority' : 'standard',
      photos: JSON.stringify(d.photos || []),
    },
  });
}

export async function myJobsCustomer(customerId: string) {
  return prisma.job.findMany({
    where: { customerId }, orderBy: { createdAt: 'desc' },
    include: { bids: { where: { status: 'active' } } },
  });
}

// Open jobs a worker may bid on — filtered to their trade + zone, annotated with
// commission + whether their service credit covers it (the bidding gate).
export async function listOpenJobsFor(workerId: string) {
  const wp = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
  if (!wp) return [];
  const cfg = await getConfig();
  const jobs = await prisma.job.findMany({
    where: { status: 'open', trade: wp.trade, zone: wp.zone },
    orderBy: { createdAt: 'desc' }, include: { bids: true, customer: true },
  });
  const out = [];
  for (const j of jobs) {
    const commissionPst = computeCommissionPst(j.budgetOfferPst, j.urgency === 'priority', cfg);
    const cov = await checkCoverage(workerId, commissionPst);
    const myBid = j.bids.find((b) => b.workerId === workerId && b.status === 'active') || null;
    out.push({
      id: j.id, trade: j.trade, description: j.description, zone: j.zone,
      budgetOfferPst: j.budgetOfferPst, urgency: j.urgency, createdAt: j.createdAt,
      commissionPst, canBid: cov.ok, blockReason: cov.reason,
      myBid: myBid ? { pricePst: myBid.pricePst, etaMin: myBid.etaMin } : null,
      bidCount: j.bids.filter((b) => b.status === 'active').length,
    });
  }
  return out;
}

// Jobs assigned to a worker (accepted / in progress).
export async function myJobsWorker(workerId: string) {
  return prisma.job.findMany({
    where: { acceptedWorkerId: workerId, status: { in: ['accepted', 'worker_done', 'cancel_pending'] } },
    orderBy: { createdAt: 'desc' },
  });
}

// ---- Bids ----
export async function submitBid(workerId: string, jobId: string, pricePst: number, etaMin: number) {
  const cfg = await getConfig();
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  if (job.status !== 'open') throw err('job_not_open', 409);
  const commissionPst = computeCommissionPst(pricePst, job.urgency === 'priority', cfg);
  const cov = await checkCoverage(workerId, commissionPst);
  if (!cov.ok) throw err('coverage_' + cov.reason, 402);
  const bid = await prisma.bid.upsert({
    where: { jobId_workerId: { jobId, workerId } },
    create: { jobId, workerId, pricePst, etaMin, status: 'active' },
    update: { pricePst, etaMin, status: 'active' },
  });
  return { ok: true, bidId: bid.id, commissionPst };
}

export async function listBidsForJob(customerId: string, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  if (job.customerId !== customerId) throw err('not_your_job', 403);
  const bids = await prisma.bid.findMany({
    where: { jobId, status: 'active' }, orderBy: { pricePst: 'asc' },
    include: { worker: { include: { workerProfile: true } } },
  });
  return bids.map((b) => {
    const wp = b.worker.workerProfile;
    return {
      id: b.id, workerId: b.workerId, name: b.worker.name, pricePst: b.pricePst, etaMin: b.etaMin,
      trade: wp?.trade ?? null,
      ratingCount: wp?.ratingCount ?? 0,
      ratingAvg: wp && wp.ratingCount ? wp.ratingSum / wp.ratingCount : null,
      jobsCompleted: wp?.jobsCompleted ?? 0,
    };
  });
}

// ---- Accept bid → commission HOLD (atomic; cannot overdraw or double-accept) ----
export async function acceptBid(customerId: string, jobId: string, bidId: string) {
  const cfg = await getConfig();
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw err('job_not_found', 404);
    if (job.customerId !== customerId) throw err('not_your_job', 403);
    if (job.status !== 'open') throw err('job_not_open', 409);
    const bid = await tx.bid.findFirst({ where: { id: bidId, jobId } });
    if (!bid) throw err('bid_not_found', 404);
    const wp = await tx.workerProfile.findUnique({ where: { userId: bid.workerId } });
    if (!wp || wp.suspended || wp.verificationStatus !== 'approved') throw err('worker_ineligible', 409);

    const commission = computeCommissionPst(bid.pricePst, job.urgency === 'priority', cfg);
    const acc = await tx.serviceCreditAccount.upsert({
      where: { workerId: bid.workerId }, create: { workerId: bid.workerId }, update: {},
    });

    const postpaidGrace = wp.walletMode === 'postpaid' && wp.jobsCompleted < Number(cfg.postpaid_job_limit);
    let bucket: string;
    if (postpaidGrace) {
      bucket = 'debt';
      await tx.serviceCreditAccount.update({ where: { id: acc.id }, data: { debtPst: { increment: commission } } });
      await tx.serviceCreditTxn.create({ data: { accountId: acc.id, type: 'hold', amountPst: commission, jobId, bucket: 'debt', note: 'commission accrued (postpaid grace)' } });
    } else {
      if (acc.debtPst > 0) throw err('debt_unsettled', 402);
      // guarded decrement: only applies if the balance still covers it -> no overdraw under races
      const moved = await tx.serviceCreditAccount.updateMany({
        where: { id: acc.id, availablePst: { gte: commission } },
        data: { availablePst: { decrement: commission }, heldPst: { increment: commission } },
      });
      if (moved.count === 0) throw err('insufficient_credit', 402);
      bucket = 'held';
      await tx.serviceCreditTxn.create({ data: { accountId: acc.id, type: 'hold', amountPst: commission, jobId, bucket: 'held', note: 'commission escrow on acceptance' } });
    }
    // claim the job atomically — a second concurrent acceptance finds count 0 and rolls back
    const claimed = await tx.job.updateMany({
      where: { id: jobId, status: 'open' },
      data: { status: 'accepted', acceptedBidId: bidId, acceptedWorkerId: bid.workerId, commissionPst: commission, commissionBucket: bucket },
    });
    if (claimed.count === 0) throw err('job_not_open', 409);
    await tx.bid.update({ where: { id: bidId }, data: { status: 'accepted' } });
    await tx.bid.updateMany({ where: { jobId, id: { not: bidId } }, data: { status: 'rejected' } });
    return { ok: true, commissionPst: commission, bucket };
  });
}

// ---- Worker marks done ----
export async function markComplete(workerId: string, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  if (job.acceptedWorkerId !== workerId) throw err('not_your_job', 403);
  if (job.status !== 'accepted') throw err('not_in_progress', 409);
  await prisma.job.update({ where: { id: jobId }, data: { status: 'worker_done' } });
  return { ok: true };
}

// ---- Customer confirms → commission CAPTURE (platform revenue) ----
export async function confirmComplete(customerId: string, jobId: string) {
  const cfg = await getConfig();
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw err('job_not_found', 404);
    if (job.customerId !== customerId) throw err('not_your_job', 403);
    if (!['worker_done', 'accepted'].includes(job.status)) throw err('not_completable', 409);
    const acc = await tx.serviceCreditAccount.findUnique({ where: { workerId: job.acceptedWorkerId! } });
    if (acc) {
      if (job.commissionBucket === 'held') {
        await tx.serviceCreditAccount.update({ where: { id: acc.id }, data: { heldPst: { decrement: job.commissionPst } } });
      }
      await tx.serviceCreditTxn.create({ data: { accountId: acc.id, type: 'capture', amountPst: job.commissionPst, jobId, bucket: job.commissionBucket, note: 'commission captured on completion' } });
    }
    await tx.job.update({ where: { id: jobId }, data: { status: 'completed', completedAt: new Date() } });
    const wp = await tx.workerProfile.findUnique({ where: { userId: job.acceptedWorkerId! } });
    if (wp) {
      const completed = wp.jobsCompleted + 1;
      const convert = wp.walletMode === 'postpaid' && completed >= Number(cfg.postpaid_job_limit);
      await tx.workerProfile.update({ where: { id: wp.id }, data: { jobsCompleted: completed, walletMode: convert ? 'prepaid' : wp.walletMode } });
    }
    return { ok: true };
  });
}

// ---- Worker cancels → pending release (hold stays) + strike logic ----
export async function cancelByWorker(workerId: string, jobId: string, contacted: boolean) {
  const cfg = await getConfig();
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  if (job.acceptedWorkerId !== workerId) throw err('not_your_job', 403);
  if (!['accepted', 'worker_done'].includes(job.status)) throw err('not_cancellable', 409);
  await prisma.job.update({ where: { id: jobId }, data: { status: 'cancel_pending', cancelledBy: 'worker', contactedBeforeCancel: contacted } });
  const since = new Date(Date.now() - 30 * 864e5);
  const cancels = await prisma.job.count({ where: { acceptedWorkerId: workerId, cancelledBy: 'worker', createdAt: { gte: since } } });
  let flagged = false, suspended = false;
  if (cancels > Number(cfg.cancel_threshold)) {
    const wp = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
    if (wp) {
      const strikes = wp.strikes + 1;
      suspended = strikes >= Number(cfg.max_strikes) || wp.suspended;
      await prisma.workerProfile.update({ where: { id: wp.id }, data: { strikes, suspended } });
      flagged = true;
    }
  }
  return { ok: true, status: 'cancel_pending', flagged, suspended };
}

// ---- Customer confirms cancel OR admin approves → RELEASE hold ----
export async function releaseHold(jobId: string, by: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw err('job_not_found', 404);
    if (job.status !== 'cancel_pending') throw err('not_pending_release', 409);
    const acc = await tx.serviceCreditAccount.findUnique({ where: { workerId: job.acceptedWorkerId! } });
    if (acc) {
      if (job.commissionBucket === 'held') {
        await tx.serviceCreditAccount.update({ where: { id: acc.id }, data: { heldPst: { decrement: job.commissionPst }, availablePst: { increment: job.commissionPst } } });
      } else if (job.commissionBucket === 'debt') {
        await tx.serviceCreditAccount.update({ where: { id: acc.id }, data: { debtPst: { decrement: job.commissionPst } } });
      }
      await tx.serviceCreditTxn.create({ data: { accountId: acc.id, type: 'release', amountPst: job.commissionPst, jobId, bucket: job.commissionBucket, note: `cancellation confirmed by ${by}` } });
    }
    await tx.job.update({ where: { id: jobId }, data: { status: 'cancelled' } });
    return { ok: true };
  });
}

// ---- Ratings ----
export async function rate(raterId: string, jobId: string, rateeId: string, stars: number, comment?: string) {
  if (stars < 1 || stars > 5) throw err('bad_stars', 400);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  await prisma.rating.create({ data: { jobId, raterId, rateeId, stars, comment: comment ?? null } });
  const wp = await prisma.workerProfile.findUnique({ where: { userId: rateeId } });
  if (wp) await prisma.workerProfile.update({ where: { id: wp.id }, data: { ratingSum: wp.ratingSum + stars, ratingCount: wp.ratingCount + 1 } });
  return { ok: true };
}
