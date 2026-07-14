import { prisma } from './db';
import { getConfig, setConfig } from './config';
import { confirmTopup } from './credit';
import { releaseHold } from './marketplace';
import { err } from './errors';

// ---- Worker verification & moderation ----
const VERIF = ['pending', 'interviewed', 'trial', 'approved', 'rejected'];
export async function setVerification(workerId: string, status: string) {
  if (!VERIF.includes(status)) throw err('bad_status', 400);
  const wp = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
  if (!wp) throw err('no_profile', 404);
  await prisma.workerProfile.update({ where: { id: wp.id }, data: { verificationStatus: status } });
  return { ok: true, status };
}
export async function setSuspended(workerId: string, on: boolean) {
  const wp = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
  if (!wp) throw err('no_profile', 404);
  await prisma.workerProfile.update({ where: { id: wp.id }, data: { suspended: on } });
  return { ok: true, suspended: on };
}

// ---- CIC data ----
export async function listWorkers() {
  const workers = await prisma.user.findMany({ where: { role: 'worker' }, include: { workerProfile: true } });
  const out = [];
  for (const w of workers) {
    const acc = await prisma.serviceCreditAccount.findUnique({ where: { workerId: w.id } });
    const wp = w.workerProfile;
    out.push({
      id: w.id, name: w.name, username: w.username, phone: w.phone,
      trade: wp?.trade, zone: wp?.zone,
      verificationStatus: wp?.verificationStatus, walletMode: wp?.walletMode,
      suspended: wp?.suspended, strikes: wp?.strikes, jobsCompleted: wp?.jobsCompleted,
      ratingCount: wp?.ratingCount ?? 0,
      ratingAvg: wp && wp.ratingCount ? wp.ratingSum / wp.ratingCount : null,
      availablePst: acc?.availablePst ?? 0, heldPst: acc?.heldPst ?? 0, debtPst: acc?.debtPst ?? 0,
    });
  }
  return out;
}

export async function verificationQueue() {
  return (await listWorkers()).filter((w) => w.verificationStatus !== 'approved' && w.verificationStatus !== 'rejected');
}

export async function walletsOverview() {
  const workers = await listWorkers();
  const captured = await prisma.serviceCreditTxn.aggregate({ _sum: { amountPst: true }, where: { type: 'capture' } });
  return {
    workers,
    totals: {
      available: workers.reduce((t, w) => t + w.availablePst, 0),
      held: workers.reduce((t, w) => t + w.heldPst, 0),
      debt: workers.reduce((t, w) => t + w.debtPst, 0),
      commissionCaptured: captured._sum.amountPst ?? 0,
    },
  };
}

export async function pendingTopups() {
  const reqs = await prisma.topupRequest.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' } });
  const withNames = [];
  for (const r of reqs) {
    const u = await prisma.user.findUnique({ where: { id: r.workerId } });
    withNames.push({ ...r, workerName: u?.name ?? r.workerId });
  }
  return withNames;
}

export async function pendingReleases() {
  const jobs = await prisma.job.findMany({ where: { status: 'cancel_pending' }, orderBy: { createdAt: 'desc' } });
  const out = [];
  for (const j of jobs) {
    const w = j.acceptedWorkerId ? await prisma.user.findUnique({ where: { id: j.acceptedWorkerId } }) : null;
    out.push({ jobId: j.id, trade: j.trade, workerName: w?.name ?? j.acceptedWorkerId, heldPst: j.commissionPst, bucket: j.commissionBucket, contactedBeforeCancel: j.contactedBeforeCancel });
  }
  return out;
}

export async function jobsTable() {
  const jobs = await prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { customer: true, bids: true } });
  return jobs.map((j) => ({
    id: j.id, trade: j.trade, zone: j.zone, urgency: j.urgency, status: j.status,
    budgetOfferPst: j.budgetOfferPst, commissionPst: j.commissionPst,
    customer: j.customer.name, bidCount: j.bids.length, createdAt: j.createdAt,
  }));
}

export async function dashboard() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [jobsTotal, jobsToday, bidsTotal, completed, cancelled, workers, captured] = await Promise.all([
    prisma.job.count(),
    prisma.job.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.bid.count(),
    prisma.job.count({ where: { status: 'completed' } }),
    prisma.job.count({ where: { status: 'cancelled' } }),
    prisma.user.count({ where: { role: 'worker' } }),
    prisma.serviceCreditTxn.aggregate({ _sum: { amountPst: true }, where: { type: 'capture' } }),
  ]);
  const finished = completed + cancelled;
  return {
    jobsTotal, jobsToday, bidsTotal, completed, cancelled, workers,
    bidsPerJob: jobsTotal ? +(bidsTotal / jobsTotal).toFixed(2) : 0,
    completionRate: finished ? Math.round((completed / finished) * 100) : 0,
    commissionCapturedPst: captured._sum.amountPst ?? 0,
    pendingTopups: await prisma.topupRequest.count({ where: { status: 'pending' } }),
    pendingReleases: await prisma.job.count({ where: { status: 'cancel_pending' } }),
    verificationQueue: (await verificationQueue()).length,
  };
}

export { getConfig, setConfig, confirmTopup, releaseHold };
