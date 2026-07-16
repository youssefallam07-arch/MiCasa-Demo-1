import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db';
import { seedConfigDefaults } from './config';
import { requestTopup, confirmTopup } from './credit';
import { postJob, submitBid, acceptBid, markComplete, confirmComplete } from './marketplace';

const hash = (pw: string) => bcrypt.hashSync(pw, 10);
const randomPw = () => crypto.randomBytes(15).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).padEnd(20, 'x');

async function wipe() {
  // delete in FK-dependency order
  await prisma.serviceCreditTxn.deleteMany();
  await prisma.serviceCreditAccount.deleteMany();
  await prisma.topupRequest.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.cancellation.deleteMany(); // Cancellation.jobId FK -> Job; must go before jobs
  await prisma.job.deleteMany();
  await prisma.workerProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.adminConfig.deleteMany();
}

async function main() {
  const existingUsers = await prisma.user.count();
  // Hosted demos run the seed on every boot (`npm start`) — only fill an
  // empty database, never touch live accounts.
  const ifEmpty = process.argv.includes('--if-empty') || process.env.SEED_IF_EMPTY;
  if (ifEmpty && existingUsers > 0) {
    console.log(`Seed skipped: database already has ${existingUsers} users (--if-empty).`);
    return;
  }
  // the seed WIPES the entire database — never allowed against production data
  if (existingUsers > 0 && process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    console.error('Refusing to seed: NODE_ENV=production and seeding wipes all data. Set FORCE_SEED=1 to override.');
    process.exit(1);
  }
  await wipe();
  await seedConfigDefaults();

  // ---- admin (the one account with direct editorial access) ----
  const adminPw = process.env.ADMIN_PASSWORD || randomPw();
  await prisma.user.create({ data: { role: 'admin', username: 'youssef_hq', name: 'Youssef HQ', passwordHash: hash(adminPw) } });

  // ---- customers (known password for local testing) ----
  const mona = await prisma.user.create({ data: { role: 'customer', username: 'mona', name: 'منى', phone: '01000000001', passwordHash: hash('password123') } });
  const khaled = await prisma.user.create({ data: { role: 'customer', username: 'khaled', name: 'خالد', phone: '01000000002', passwordHash: hash('password123') } });

  // ---- workers ----
  async function makeWorker(username: string, name: string, trade: string, zone: string, verification: string, walletMode: string, professions?: string[], bio = '') {
    const u = await prisma.user.create({ data: { role: 'worker', username, name, phone: '0111' + Math.floor(Math.random() * 1e7), passwordHash: hash('password123') } });
    const profs = (professions && professions.length ? professions : [trade]);
    await prisma.workerProfile.create({ data: { userId: u.id, trade: profs[0], professions: profs.join(','), bio, zone, verificationStatus: verification, walletMode } });
    await prisma.serviceCreditAccount.create({ data: { workerId: u.id } });
    return u;
  }
  const ahmed = await makeWorker('ahmed', 'أحمد السباك', 'plumbing', 'المعادي', 'approved', 'prepaid', ['plumbing', 'ac'], 'سباك وفني تكييفات — خبرة 8 سنين في المعادي.');   // funded, prepaid, 2 trades
  const mahmoud = await makeWorker('mahmoud', 'محمود الكهربائي', 'electrical', 'المعادي', 'approved', 'prepaid', ['electrical', 'appliance'], 'كهربائي وفني أجهزة منزلية.'); // funded, prepaid, 2 trades
  await makeWorker('saeed', 'سعيد النجار', 'carpentry', 'مدينة نصر', 'pending', 'prepaid', ['carpentry']);               // in verification queue

  // fund service credit (manual top-up → admin-confirmed). Prepaid-only: a worker
  // must hold positive credit >= commission to bid AND to accept, so every worker
  // that transacts below is funded up front.
  const tuA = await requestTopup(ahmed.id, 20000, 'vodafone_cash');
  await confirmTopup(tuA.ref);
  const tuM = await requestTopup(mahmoud.id, 20000, 'vodafone_cash');
  await confirmTopup(tuM.ref);

  // ---- 4 jobs in different states ----
  // j1: OPEN with a bid
  const j1 = await postJob(mona.id, { trade: 'plumbing', description: 'حنفية المطبخ بتنقّط مياه', zone: 'المعادي', budgetOfferPst: 30000, urgency: 'standard' });
  await submitBid(ahmed.id, j1.id, 28000, 30);

  // j2: ACCEPTED (prepaid worker → commission held in escrow; visible in CIC)
  const j2 = await postJob(mona.id, { trade: 'electrical', description: 'فيشة الغرفة بتفصل الكهربا', zone: 'المعادي', budgetOfferPst: 25000, urgency: 'standard' });
  const b2 = await submitBid(mahmoud.id, j2.id, 24000, 25);
  await acceptBid(mona.id, j2.id, b2.bidId);

  // j3: COMPLETED (prepaid worker → held then captured as platform revenue)
  const j3 = await postJob(khaled.id, { trade: 'plumbing', description: 'ماسورة الحمام مكسورة - طارئ', zone: 'المعادي', budgetOfferPst: 40000, urgency: 'priority' });
  const b3 = await submitBid(ahmed.id, j3.id, 38000, 20);
  await acceptBid(khaled.id, j3.id, b3.bidId);
  await markComplete(ahmed.id, j3.id);
  await confirmComplete(khaled.id, j3.id);

  // j4: OPEN, no bids (no approved worker in that trade/zone yet)
  await postJob(khaled.id, { trade: 'carpentry', description: 'باب الأوضة بيصوّت ومحتاج تظبيط', zone: 'مدينة نصر', budgetOfferPst: 35000, urgency: 'standard' });

  // ---- write first-login credentials (gitignored) ----
  const here = path.dirname(fileURLToPath(import.meta.url));
  const docs = path.resolve(here, '../../../docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'FIRST_LOGIN.md'), [
    '# First login — CIC admin', '',
    '**Change this password immediately after first login (CIC → change password).**', '',
    '- Username: `youssef_hq`',
    '- Password: `' + adminPw + '`', '',
    '## Test accounts (local seed, password `password123`)',
    '- Customers: `mona`, `khaled`',
    '- Workers: `ahmed` (approved, prepaid, funded), `mahmoud` (approved, prepaid, funded), `saeed` (pending verification)', '',
  ].join('\n'));

  const box = (s: string) => { const line = '═'.repeat(s.length + 4); return `\n╔${line}╗\n║  ${s}  ║\n╚${line}╝\n`; };
  console.log(box(`ADMIN  youssef_hq  /  ${adminPw}`));
  console.log('Seed complete: 1 admin, 2 customers, 3 workers, 4 jobs (open+bid / accepted / completed / open).');
  console.log('Credentials also written to docs/FIRST_LOGIN.md (gitignored).');
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  // Boot seeding (`npm start` -> seed:boot --if-empty) must never take the whole
  // deployment down: the server can serve with an empty DB and the admin login
  // still works (synced from ADMIN_PASSWORD on boot). Fail loudly but exit 0 so
  // `npm start` proceeds to the server. A manual `seed` run still exits non-zero.
  const boot = process.argv.includes('--if-empty') || process.env.SEED_IF_EMPTY;
  if (boot) {
    console.error('[seed:boot] seeding failed — continuing to start the server anyway (empty/partial DB; admin login still works).');
    process.exit(0);
  }
  process.exit(1);
});
