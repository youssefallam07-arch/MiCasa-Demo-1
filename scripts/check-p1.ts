// P1 trust-integrity logic checks — run against the mainframe directly.
//   npm run check:p1     (tsx scripts/check-p1.ts)
// Creates isolated fixtures (tagged), exercises the rules, then cleans up.
import bcrypt from 'bcryptjs';
import { prisma } from '../packages/mainframe/src/db';
import * as mf from '../packages/mainframe/src/index';
import { setConfig, getConfig } from '../packages/mainframe/src/config';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  [' + x + ']' : '')); } };
const expectCode = async (n: string, code: string, fn: () => Promise<any>) => {
  try { await fn(); ok(n, false, 'no error thrown'); }
  catch (e: any) { ok(n, e?.code === code, 'got ' + (e?.code || e?.message)); }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const userIds: string[] = [];
async function mkUser(role: string, tag: string) {
  const u = await prisma.user.create({ data: { role, username: tag, name: tag, passwordHash: bcrypt.hashSync('x', 4) } });
  userIds.push(u.id);
  return u;
}
async function mkWorker(tag: string, funded = 5_000_00) {
  const u = await mkUser('worker', tag);
  await prisma.workerProfile.create({ data: { userId: u.id, trade: 'plumbing', zone: 'P1ZONE', verificationStatus: 'approved', walletMode: 'prepaid' } });
  await prisma.serviceCreditAccount.create({ data: { workerId: u.id, availablePst: funded } });
  return u;
}
const acct = (workerId: string) => prisma.serviceCreditAccount.findUnique({ where: { workerId } });
async function completedJob(cust: any, work: any) {
  const job = await mf.postJob(cust.id, { trade: 'plumbing', description: 'test', zone: 'P1ZONE', budgetOfferPst: 30000, urgency: 'standard' });
  const bid = await mf.submitBid(work.id, job.id, 20000, 30);
  await mf.acceptBid(cust.id, job.id, bid.bidId);
  await mf.markComplete(work.id, job.id);
  return job;
}

async function main() {
  const T = 'p1_' + Date.now();
  const cust = await mkUser('customer', T + '_c');
  const stranger = await mkUser('customer', T + '_c2');
  const work = await mkWorker(T + '_w');

  console.log('P1 trust-integrity checks\n--- ratings ---');
  const job = await completedJob(cust, work);

  // rate before completion -> 409 job_not_completed (job is worker_done here)
  await expectCode('rate a non-completed job -> job_not_completed', 'job_not_completed', () => mf.rate(cust.id, job.id, work.id, 5));

  await mf.confirmComplete(cust.id, job.id); // now completed

  // valid rating
  await mf.rate(cust.id, job.id, work.id, 5);
  let wp = await prisma.workerProfile.findUnique({ where: { userId: work.id } });
  ok('valid rating recorded (count=1, sum=5)', wp!.ratingCount === 1 && wp!.ratingSum === 5, `count=${wp!.ratingCount} sum=${wp!.ratingSum}`);

  // second rating by same customer -> 409 rating_exists
  await expectCode('rate the same job twice -> rating_exists', 'rating_exists', () => mf.rate(cust.id, job.id, work.id, 4));

  // stranger -> 403 not_a_participant
  await expectCode('stranger rates -> not_a_participant', 'not_a_participant', () => mf.rate(stranger.id, job.id, work.id, 1));

  // worker rates the customer back (valid, counterparty)
  await mf.rate(work.id, job.id, cust.id, 4);
  wp = await prisma.workerProfile.findUnique({ where: { userId: work.id } });
  ok('aggregate still count=1 after worker rates customer', wp!.ratingCount === 1, `count=${wp!.ratingCount}`);

  console.log('--- customer cancellations ---');
  // open job cancel -> no money moved
  const openJob = await mf.postJob(cust.id, { trade: 'plumbing', description: 'open', zone: 'P1ZONE', budgetOfferPst: 25000, urgency: 'standard' });
  await mf.cancelOpenJob(cust.id, openJob.id);
  const openAfter = await prisma.job.findUnique({ where: { id: openJob.id } });
  const ledgerForOpen = await prisma.serviceCreditTxn.count({ where: { jobId: openJob.id } });
  ok('open-job cancel -> cancelled, zero ledger rows', openAfter!.status === 'cancelled' && ledgerForOpen === 0, `status=${openAfter!.status} ledger=${ledgerForOpen}`);

  // customer cancels an accepted job -> pending -> worker confirms -> released
  const j2 = await prisma.job.findUnique({ where: { id: (await (async () => {
    const jb = await mf.postJob(cust.id, { trade: 'plumbing', description: 'acc', zone: 'P1ZONE', budgetOfferPst: 30000, urgency: 'standard' });
    const b = await mf.submitBid(work.id, jb.id, 20000, 30);
    await mf.acceptBid(cust.id, jb.id, b.bidId);
    return jb.id;
  })()) } });
  const heldAcc = await acct(work.id);
  const availAfterHold = heldAcc!.availablePst, heldAfterHold = heldAcc!.heldPst;
  ok('accept placed a hold (>0 held)', heldAfterHold > 0, `held=${heldAfterHold}`);
  await mf.cancelByCustomer(cust.id, j2!.id, false);
  const pend = await prisma.job.findUnique({ where: { id: j2!.id } });
  ok('customer-cancel accepted -> cancel_pending (by customer)', pend!.status === 'cancel_pending' && pend!.cancelledBy === 'customer', `status=${pend!.status} by=${pend!.cancelledBy}`);
  await mf.releaseHold(j2!.id, 'worker'); // worker confirms
  const afterRelease = await acct(work.id);
  const j2done = await prisma.job.findUnique({ where: { id: j2!.id } });
  ok('worker confirm -> released (held back to available)', j2done!.status === 'cancelled' && afterRelease!.availablePst === availAfterHold + heldAfterHold && afterRelease!.heldPst === heldAfterHold - pend!.commissionPst, `avail ${availAfterHold}->${afterRelease!.availablePst}`);

  console.log('--- auto-capture ---');
  const j3 = await completedJob(cust, work); // worker_done
  const cfgBefore = await getConfig();
  await setConfig('auto_capture_hours', '0'); // any worker_done older than "now" captures
  await wait(60);
  const swept = await mf.autoCaptureStale();
  const j3after = await prisma.job.findUnique({ where: { id: j3.id } });
  const capTxn = await prisma.serviceCreditTxn.count({ where: { jobId: j3.id, type: 'capture' } });
  ok('stale worker_done job auto-captured on tick', j3after!.status === 'completed' && capTxn === 1 && swept.captured >= 1, `status=${j3after!.status} capTxn=${capTxn} captured=${swept.captured}`);
  await setConfig('auto_capture_hours', cfgBefore.auto_capture_hours);

  console.log('--- strike window respects cancellation time ---');
  await setConfig('cancel_threshold', '1'); // strike when recent cancels > 1
  const flaker = await mkWorker(T + '_flake', 5_000_00);
  // inject an OLD cancellation (40d ago) — must NOT count toward the 30d window
  const dummy = await mf.postJob(cust.id, { trade: 'plumbing', description: 'old', zone: 'P1ZONE', budgetOfferPst: 20000, urgency: 'standard' });
  await prisma.cancellation.create({ data: { jobId: dummy.id, by: 'worker', byUserId: flaker.id, createdAt: new Date(Date.now() - 40 * 864e5) } });
  // first REAL recent cancel: recent count = 1, not > 1 -> not flagged (proves old one excluded)
  const a1 = await completedJobAccepted(cust, flaker);
  const r1 = await mf.cancelByWorker(flaker.id, a1, false);
  ok('old (40d) cancellation excluded — 1 recent cancel does NOT strike', r1.flagged === false, `flagged=${r1.flagged}`);
  // second REAL recent cancel: recent count = 2 > 1 -> flagged
  const a2 = await completedJobAccepted(cust, flaker);
  const r2 = await mf.cancelByWorker(flaker.id, a2, false);
  ok('2 recent cancels within window -> strike applied', r2.flagged === true, `flagged=${r2.flagged}`);
  await setConfig('cancel_threshold', cfgBefore.cancel_threshold);

  console.log(`\n${pass} passed, ${fail} failed`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

// helper: create an accepted job for a worker, return jobId
async function completedJobAccepted(cust: any, work: any) {
  const jb = await mf.postJob(cust.id, { trade: 'plumbing', description: 'x', zone: 'P1ZONE', budgetOfferPst: 20000, urgency: 'standard' });
  const b = await mf.submitBid(work.id, jb.id, 15000, 30);
  await mf.acceptBid(cust.id, jb.id, b.bidId);
  return jb.id;
}

async function cleanup() {
  const jobIds = (await prisma.job.findMany({ where: { customerId: { in: userIds } }, select: { id: true } })).map((j) => j.id);
  await prisma.cancellation.deleteMany({ where: { OR: [{ byUserId: { in: userIds } }, { jobId: { in: jobIds } }] } });
  await prisma.rating.deleteMany({ where: { OR: [{ raterId: { in: userIds } }, { rateeId: { in: userIds } }, { jobId: { in: jobIds } }] } });
  await prisma.bid.deleteMany({ where: { OR: [{ workerId: { in: userIds } }, { jobId: { in: jobIds } }] } });
  const accts = await prisma.serviceCreditAccount.findMany({ where: { workerId: { in: userIds } }, select: { id: true } });
  await prisma.serviceCreditTxn.deleteMany({ where: { OR: [{ accountId: { in: accts.map((a) => a.id) } }, { jobId: { in: jobIds } }] } });
  await prisma.serviceCreditAccount.deleteMany({ where: { workerId: { in: userIds } } });
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.workerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
