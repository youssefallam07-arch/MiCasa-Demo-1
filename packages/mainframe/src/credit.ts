import { prisma } from './db';
import { getConfig } from './config';
import { err } from './errors';

// commission = rate% of the accepted bid, floored to whole piasters.
export function computeCommissionPst(bidPst: number, priority: boolean, cfg: Record<string, string>): number {
  const rate = priority ? Number(cfg.commission_priority) : Number(cfg.commission_standard);
  return Math.floor((bidPst * rate) / 100);
}

export async function getOrCreateAccount(workerId: string) {
  return prisma.serviceCreditAccount.upsert({ where: { workerId }, create: { workerId }, update: {} });
}

export async function accountView(workerId: string) {
  const acc = await getOrCreateAccount(workerId);
  const txns = await prisma.serviceCreditTxn.findMany({
    where: { accountId: acc.id }, orderBy: { createdAt: 'desc' }, take: 100,
  });
  return { ...acc, txns };
}

// Bidding gate — pure check, no mutation. Used to warn workers and hide unbiddable jobs.
export async function checkCoverage(workerId: string, commissionPst: number) {
  const cfg = await getConfig();
  const wp = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
  if (!wp) return { ok: false, reason: 'no_profile', availablePst: 0 };
  if (wp.suspended) return { ok: false, reason: 'suspended', availablePst: 0 };
  if (wp.verificationStatus !== 'approved') return { ok: false, reason: 'not_verified', availablePst: 0 };
  const acc = await getOrCreateAccount(workerId);
  if (wp.walletMode === 'postpaid' && wp.jobsCompleted < Number(cfg.postpaid_job_limit))
    return { ok: true, reason: 'postpaid', availablePst: acc.availablePst };
  if (acc.debtPst > 0) return { ok: false, reason: 'debt_unsettled', availablePst: acc.availablePst };
  if (acc.availablePst >= commissionPst) return { ok: true, reason: '', availablePst: acc.availablePst };
  return { ok: false, reason: 'insufficient', availablePst: acc.availablePst };
}

// ---- Top-up (manual, admin-confirmed) ----
export async function requestTopup(workerId: string, amountPst: number, method: string) {
  const cfg = await getConfig();
  if (amountPst < Number(cfg.min_topup)) throw err('below_minimum', 400);
  const ref = 'TU-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await prisma.topupRequest.create({ data: { workerId, amountPst, method, ref } });
  return { ok: true, ref, status: 'pending_admin_confirmation' };
}

export async function confirmTopup(ref: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.topupRequest.findUnique({ where: { ref } });
    if (!req) throw err('not_found', 404);
    if (req.status === 'confirmed') throw err('already_confirmed', 409);
    const acc = await tx.serviceCreditAccount.upsert({
      where: { workerId: req.workerId }, create: { workerId: req.workerId }, update: {},
    });
    await tx.serviceCreditTxn.create({
      data: { accountId: acc.id, type: 'topup', amountPst: req.amountPst, bucket: 'available', note: `via ${req.method} ${ref}` },
    });
    // settle outstanding debt first, remainder goes to available
    const settle = Math.min(acc.debtPst, req.amountPst);
    if (settle > 0) {
      await tx.serviceCreditTxn.create({
        data: { accountId: acc.id, type: 'adjustment', amountPst: -settle, bucket: 'debt', note: 'debt settled from top-up' },
      });
    }
    await tx.serviceCreditAccount.update({
      where: { id: acc.id },
      data: { debtPst: acc.debtPst - settle, availablePst: acc.availablePst + (req.amountPst - settle) },
    });
    await tx.topupRequest.update({ where: { ref }, data: { status: 'confirmed' } });
    return { ok: true };
  });
}
