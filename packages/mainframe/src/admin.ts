import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { getConfig, setConfig } from './config';
import { confirmTopup } from './credit';
import { releaseHold } from './marketplace';
import { err } from './errors';

// Make the admin login deterministic on hosted deploys: if ADMIN_PASSWORD is set,
// force the owner account's password to match it on every boot. Lets the owner
// control the live credential from the Render env var regardless of DB state.
// (No ADMIN_PASSWORD -> no-op, so local dev keeps its seeded password.)
export async function reconcileAdminFromEnv() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return { skipped: true as const };
  const username = process.env.ADMIN_USERNAME || 'youssef_hq';
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.role !== 'admin') return { skipped: true as const, reason: 'no_admin' };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: bcrypt.hashSync(pw, 10) } });
  return { updated: true as const, username };
}

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
  // batch the wallets in one query instead of one-per-worker (was N+1)
  const accounts = await prisma.serviceCreditAccount.findMany({ where: { workerId: { in: workers.map((w) => w.id) } } });
  const accByWorker = new Map(accounts.map((a) => [a.workerId, a]));
  return workers.map((w) => {
    const wp = w.workerProfile;
    const acc = accByWorker.get(w.id);
    return {
      id: w.id, name: w.name, username: w.username, phone: w.phone,
      trade: wp?.trade, zone: wp?.zone,
      verificationStatus: wp?.verificationStatus, walletMode: wp?.walletMode,
      suspended: wp?.suspended, strikes: wp?.strikes, jobsCompleted: wp?.jobsCompleted,
      ratingCount: wp?.ratingCount ?? 0,
      ratingAvg: wp && wp.ratingCount ? wp.ratingSum / wp.ratingCount : null,
      availablePst: acc?.availablePst ?? 0, heldPst: acc?.heldPst ?? 0, debtPst: acc?.debtPst ?? 0,
    };
  });
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
  const users = await prisma.user.findMany({ where: { id: { in: reqs.map((r) => r.workerId) } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return reqs.map((r) => ({ ...r, workerName: nameById.get(r.workerId) ?? r.workerId }));
}

export async function pendingReleases() {
  const jobs = await prisma.job.findMany({ where: { status: 'cancel_pending' }, orderBy: { createdAt: 'desc' } });
  const workerIds = jobs.map((j) => j.acceptedWorkerId).filter(Boolean) as string[];
  const users = await prisma.user.findMany({ where: { id: { in: workerIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return jobs.map((j) => ({
    jobId: j.id, trade: j.trade,
    workerName: (j.acceptedWorkerId && nameById.get(j.acceptedWorkerId)) || j.acceptedWorkerId,
    heldPst: j.commissionPst, bucket: j.commissionBucket, contactedBeforeCancel: j.contactedBeforeCancel, cancelledBy: j.cancelledBy,
  }));
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
    verificationQueue: await prisma.workerProfile.count({ where: { verificationStatus: { notIn: ['approved', 'rejected'] } } }),
  };
}

// ---- CENTCOM: full account registry (every signup, every role, persistent) ----
export async function allAccounts() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, include: { workerProfile: true } });
  const workerIds = users.filter((u) => u.role === 'worker').map((u) => u.id);
  const customerIds = users.filter((u) => u.role === 'customer').map((u) => u.id);
  // one query each for wallets, jobs-posted, and bids-made (was 3 queries PER user)
  const [accounts, jobGroups, bidGroups] = await Promise.all([
    prisma.serviceCreditAccount.findMany({ where: { workerId: { in: workerIds } } }),
    prisma.job.groupBy({ by: ['customerId'], where: { customerId: { in: customerIds } }, _count: { _all: true } }),
    prisma.bid.groupBy({ by: ['workerId'], where: { workerId: { in: workerIds } }, _count: { _all: true } }),
  ]);
  const accByWorker = new Map(accounts.map((a) => [a.workerId, a]));
  const jobsByCustomer = new Map(jobGroups.map((g) => [g.customerId, g._count._all]));
  const bidsByWorker = new Map(bidGroups.map((g) => [g.workerId, g._count._all]));
  return users.map((u) => {
    const credit = u.role === 'worker' ? accByWorker.get(u.id) : null;
    return {
      id: u.id, role: u.role, username: u.username, name: u.name, phone: u.phone, createdAt: u.createdAt,
      trade: u.workerProfile?.trade ?? null, zone: u.workerProfile?.zone ?? null,
      verificationStatus: u.workerProfile?.verificationStatus ?? null,
      walletMode: u.workerProfile?.walletMode ?? null, suspended: u.workerProfile?.suspended ?? null,
      jobsCompleted: u.workerProfile?.jobsCompleted ?? null,
      availablePst: credit?.availablePst ?? null, heldPst: credit?.heldPst ?? null, debtPst: credit?.debtPst ?? null,
      jobsPosted: jobsByCustomer.get(u.id) ?? 0, bidsMade: bidsByWorker.get(u.id) ?? 0,
    };
  });
}

export async function platformOverview() {
  const [customers, workers, admins, jobs, completed, open, captured, pendingVetting] = await Promise.all([
    prisma.user.count({ where: { role: 'customer' } }),
    prisma.user.count({ where: { role: 'worker' } }),
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.job.count(), prisma.job.count({ where: { status: 'completed' } }),
    prisma.job.count({ where: { status: 'open' } }),
    prisma.serviceCreditTxn.aggregate({ _sum: { amountPst: true }, where: { type: 'capture' } }),
    prisma.workerProfile.count({ where: { verificationStatus: { notIn: ['approved', 'rejected'] } } }),
  ]);
  return {
    customers, workers, admins, totalAccounts: customers + workers + admins,
    jobs, completed, open, commissionCapturedPst: captured._sum.amountPst ?? 0,
    pendingVetting,
  };
}

// Permanently delete an account and everything it owns (only way a record leaves the DB).
export async function deleteAccount(userId: string) {
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u) throw err('not_found', 404);
    if (u.role === 'admin') {
      const admins = await tx.user.count({ where: { role: 'admin' } });
      if (admins <= 1) throw err('cannot_delete_last_admin', 409);
    }
    const ownedJobs = await tx.job.findMany({ where: { customerId: userId }, select: { id: true } });
    const jobIds = ownedJobs.map((j) => j.id);
    await tx.rating.deleteMany({ where: { OR: [{ raterId: userId }, { rateeId: userId }, { jobId: { in: jobIds } }] } });
    await tx.bid.deleteMany({ where: { OR: [{ workerId: userId }, { jobId: { in: jobIds } }] } });
    const acc = await tx.serviceCreditAccount.findUnique({ where: { workerId: userId } });
    if (acc) { await tx.serviceCreditTxn.deleteMany({ where: { accountId: acc.id } }); await tx.serviceCreditAccount.delete({ where: { id: acc.id } }); }
    await tx.topupRequest.deleteMany({ where: { workerId: userId } });
    await tx.workerProfile.deleteMany({ where: { userId } });
    await tx.job.deleteMany({ where: { customerId: userId } });
    await tx.user.delete({ where: { id: userId } });
    return { ok: true, deleted: u.username };
  });
}

export { getConfig, setConfig, confirmTopup, releaseHold };
