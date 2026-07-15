import { prisma } from './db';
import { getConfig } from './config';
import { err } from './errors';
import { logEvent } from './audit';
import { computeCommissionPst, checkCoverage } from './credit';

// ---- Jobs ----
export async function postJob(customerId: string, d: {
  trade: string; description: string; zone: string; budgetOfferPst: number; urgency: string; photos?: string[];
}) {
  const job = await prisma.job.create({
    data: {
      customerId, trade: d.trade, description: d.description, zone: d.zone,
      budgetOfferPst: d.budgetOfferPst, urgency: d.urgency === 'priority' ? 'priority' : 'standard',
      photos: JSON.stringify(d.photos || []),
    },
  });
  logEvent(customerId, 'job.posted', job.id, `${d.trade} · ${d.zone} · EGP ${Math.round(d.budgetOfferPst / 100)}`);
  return job;
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
  logEvent(workerId, 'bid.placed', jobId, `EGP ${Math.round(pricePst / 100)} · ${etaMin}min`);
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
    logEvent(customerId, 'job.accepted', jobId, `worker bid EGP ${Math.round(bid.pricePst / 100)} · commission held EGP ${Math.round(commission / 100)}`);
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
  logEvent(workerId, 'job.worker_done', jobId, 'worker marked the job done');
  return { ok: true };
}

// --- Shared money operations (identical atomic ops; kept in one place so
//     confirm/force/auto-capture and release/force-cancel can't drift). ---
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// CAPTURE: move held commission to platform revenue (debt stays owed).
async function captureCommission(tx: Tx, job: { id: string; acceptedWorkerId: string | null; commissionPst: number; commissionBucket: string }, note: string) {
  const acc = await tx.serviceCreditAccount.findUnique({ where: { workerId: job.acceptedWorkerId! } });
  if (!acc) return;
  if (job.commissionBucket === 'held') {
    await tx.serviceCreditAccount.update({ where: { id: acc.id }, data: { heldPst: { decrement: job.commissionPst } } });
  }
  await tx.serviceCreditTxn.create({ data: { accountId: acc.id, type: 'capture', amountPst: job.commissionPst, jobId: job.id, bucket: job.commissionBucket, note } });
}

// RELEASE: return a held commission to available, or wipe the accrued debt.
async function releaseCommission(tx: Tx, job: { id: string; acceptedWorkerId: string | null; commissionPst: number; commissionBucket: string }, note: string) {
  const acc = await tx.serviceCreditAccount.findUnique({ where: { workerId: job.acceptedWorkerId! } });
  if (!acc) return;
  if (job.commissionBucket === 'held') {
    await tx.serviceCreditAccount.update({ where: { id: acc.id }, data: { heldPst: { decrement: job.commissionPst }, availablePst: { increment: job.commissionPst } } });
  } else if (job.commissionBucket === 'debt') {
    await tx.serviceCreditAccount.update({ where: { id: acc.id }, data: { debtPst: { decrement: job.commissionPst } } });
  }
  await tx.serviceCreditTxn.create({ data: { accountId: acc.id, type: 'release', amountPst: job.commissionPst, jobId: job.id, bucket: job.commissionBucket, note } });
}

// Finish a job: capture commission, mark completed, credit the worker + convert postpaid→prepaid.
async function finalizeCompletion(tx: Tx, job: any, cfg: Record<string, string>, note: string) {
  await captureCommission(tx, job, note);
  await tx.job.update({ where: { id: job.id }, data: { status: 'completed', completedAt: new Date() } });
  const wp = await tx.workerProfile.findUnique({ where: { userId: job.acceptedWorkerId! } });
  if (wp) {
    const completed = wp.jobsCompleted + 1;
    const convert = wp.walletMode === 'postpaid' && completed >= Number(cfg.postpaid_job_limit);
    await tx.workerProfile.update({ where: { id: wp.id }, data: { jobsCompleted: completed, walletMode: convert ? 'prepaid' : wp.walletMode } });
  }
}

// ---- Customer confirms → commission CAPTURE (platform revenue) ----
export async function confirmComplete(customerId: string, jobId: string) {
  const cfg = await getConfig();
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw err('job_not_found', 404);
    if (job.customerId !== customerId) throw err('not_your_job', 403);
    if (!['worker_done', 'accepted'].includes(job.status)) throw err('not_completable', 409);
    await finalizeCompletion(tx, job, cfg, 'commission captured on completion');
    logEvent(customerId, 'job.completed', jobId, `confirmed by customer · commission EGP ${Math.round(job.commissionPst / 100)} captured`);
    return { ok: true };
  });
}

// ---- Customer cancels an OPEN job → cancelled, no money moved ----
export async function cancelOpenJob(customerId: string, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  if (job.customerId !== customerId) throw err('not_your_job', 403);
  if (job.status !== 'open') throw err('not_open', 409);
  await prisma.$transaction([
    prisma.job.update({ where: { id: jobId }, data: { status: 'cancelled', cancelledBy: 'customer' } }),
    prisma.bid.updateMany({ where: { jobId, status: 'active' }, data: { status: 'withdrawn' } }),
    prisma.cancellation.create({ data: { jobId, by: 'customer', byUserId: customerId, note: 'open job cancelled by customer' } }),
  ]);
  logEvent(customerId, 'job.cancelled', jobId, 'open job cancelled by customer (no money moved)');
  return { ok: true, status: 'cancelled' };
}

// ---- Customer cancels an ACCEPTED job → pending release (mirrors worker flow, no strikes) ----
export async function cancelByCustomer(customerId: string, jobId: string, contacted: boolean) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  if (job.customerId !== customerId) throw err('not_your_job', 403);
  if (!['accepted', 'worker_done'].includes(job.status)) throw err('not_cancellable', 409);
  await prisma.$transaction([
    prisma.job.update({ where: { id: jobId }, data: { status: 'cancel_pending', cancelledBy: 'customer', contactedBeforeCancel: contacted } }),
    prisma.cancellation.create({ data: { jobId, by: 'customer', byUserId: customerId, contacted, note: 'accepted job cancelled by customer' } }),
  ]);
  logEvent(customerId, 'job.cancel_requested', jobId, 'customer requested cancellation of an accepted job');
  return { ok: true, status: 'cancel_pending' };
}

// ---- Worker cancels → pending release (hold stays) + strike logic ----
export async function cancelByWorker(workerId: string, jobId: string, contacted: boolean) {
  const cfg = await getConfig();
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  if (job.acceptedWorkerId !== workerId) throw err('not_your_job', 403);
  if (!['accepted', 'worker_done'].includes(job.status)) throw err('not_cancellable', 409);
  await prisma.$transaction([
    prisma.job.update({ where: { id: jobId }, data: { status: 'cancel_pending', cancelledBy: 'worker', contactedBeforeCancel: contacted } }),
    prisma.cancellation.create({ data: { jobId, by: 'worker', byUserId: workerId, contacted, note: 'accepted job cancelled by worker' } }),
  ]);
  // Strike window counts CANCELLATION events in the last 30d — not job age (the old bug).
  const since = new Date(Date.now() - 30 * 864e5);
  const cancels = await prisma.cancellation.count({ where: { by: 'worker', byUserId: workerId, createdAt: { gte: since } } });
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
  logEvent(workerId, 'job.cancel_requested', jobId, `worker cancelled${flagged ? ' · STRIKE applied' : ''}${suspended ? ' · SUSPENDED' : ''}`);
  return { ok: true, status: 'cancel_pending', flagged, suspended };
}

// ---- Counterparty confirms a cancellation OR admin approves → RELEASE hold ----
export async function releaseHold(jobId: string, by: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw err('job_not_found', 404);
    if (job.status !== 'cancel_pending') throw err('not_pending_release', 409);
    await releaseCommission(tx, job, `cancellation confirmed by ${by}`);
    await tx.job.update({ where: { id: jobId }, data: { status: 'cancelled' } });
    logEvent(null, 'job.cancelled', jobId, `commission hold released · confirmed by ${by}`);
    return { ok: true };
  });
}

// ---- Admin overrides — force a stuck job to a terminal state, with a required reason ----
export async function forceComplete(jobId: string, note: string) {
  const cfg = await getConfig();
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw err('job_not_found', 404);
    if (!['accepted', 'worker_done', 'cancel_pending'].includes(job.status)) throw err('not_overridable', 409);
    await finalizeCompletion(tx, job, cfg, `admin override: ${note}`);
    logEvent(null, 'job.force_completed', jobId, `admin override: ${note}`);
    return { ok: true, status: 'completed' };
  });
}

export async function forceCancel(jobId: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw err('job_not_found', 404);
    if (!['accepted', 'worker_done', 'cancel_pending'].includes(job.status)) throw err('not_overridable', 409);
    await releaseCommission(tx, job, `admin override: ${note}`);
    await tx.job.update({ where: { id: jobId }, data: { status: 'cancelled', cancelledBy: 'admin' } });
    await tx.cancellation.create({ data: { jobId, by: 'admin', note: `admin override: ${note}` } });
    logEvent(null, 'job.force_cancelled', jobId, `admin override: ${note}`);
    return { ok: true, status: 'cancelled' };
  });
}

// ---- Auto-capture: worker_done jobs the customer never confirmed, past the window ----
export async function autoCaptureStale() {
  const cfg = await getConfig();
  const hours = Number(cfg.auto_capture_hours || 72);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  const stale = await prisma.job.findMany({ where: { status: 'worker_done', updatedAt: { lt: cutoff } } });
  let captured = 0;
  for (const job of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.job.findUnique({ where: { id: job.id } });
        if (!fresh || fresh.status !== 'worker_done') return; // race guard
        await finalizeCompletion(tx, fresh, cfg, `auto-captured after ${hours}h (customer never confirmed)`);
      });
      logEvent(null, 'job.auto_captured', job.id, `auto-captured after ${hours}h — customer never confirmed`);
      captured++;
    } catch { /* skip an individual failure, keep going */ }
  }
  return { captured, scanned: stale.length };
}

// ---- Ratings ----
export async function rate(raterId: string, jobId: string, rateeId: string, stars: number, comment?: string) {
  if (stars < 1 || stars > 5) throw err('bad_stars', 400);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw err('job_not_found', 404);
  // A rating is only valid on a completed job, from a participant, about the other participant.
  if (job.status !== 'completed') throw err('job_not_completed', 409);
  let expectedRatee: string | null = null;
  if (raterId === job.customerId) expectedRatee = job.acceptedWorkerId;
  else if (raterId === job.acceptedWorkerId) expectedRatee = job.customerId;
  else throw err('not_a_participant', 403);
  if (!expectedRatee || rateeId !== expectedRatee) throw err('bad_ratee', 400);
  try {
    await prisma.rating.create({ data: { jobId, raterId, rateeId, stars, comment: comment ?? null } });
  } catch (e: any) {
    if (e?.code === 'P2002') throw err('rating_exists', 409); // one rating per person per job
    throw e;
  }
  await recomputeRatingFor(rateeId);
  logEvent(raterId, 'job.rated', jobId, `${stars}★${comment ? ' · ' + comment : ''}`);
  return { ok: true };
}

// Recompute a worker's rating aggregate from the rating rows (authoritative — no drift).
export async function recomputeRatingFor(userId: string) {
  const wp = await prisma.workerProfile.findUnique({ where: { userId } });
  if (!wp) return; // only workers carry an aggregate
  const agg = await prisma.rating.aggregate({ where: { rateeId: userId }, _sum: { stars: true }, _count: { _all: true } });
  await prisma.workerProfile.update({ where: { id: wp.id }, data: { ratingSum: agg._sum.stars ?? 0, ratingCount: agg._count._all } });
}

// Backfill guard — recompute every worker's aggregate (keeps seed/legacy correct).
export async function recomputeAllRatings() {
  const profiles = await prisma.workerProfile.findMany({ select: { userId: true } });
  for (const p of profiles) await recomputeRatingFor(p.userId);
}
