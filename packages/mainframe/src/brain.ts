// CIC "Brain" — a real intelligence snapshot assembled from the live DB.
// No external LLM: every number here is derived from the actual platform state.
// Batches all reads (no N+1) — one worker query, one recent-jobs query, a handful
// of counts/aggregates, all fired in parallel.
import { prisma } from './db';
import { listWorkers, pendingTopups, pendingReleases } from './admin';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// normalize a zone/trade token for grouping (trims whitespace + case; harmless for Arabic)
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const SEV_RANK: Record<string, number> = { high: 3, med: 2, low: 1 };

export async function computeBrain() {
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const d7 = new Date(now - 7 * DAY);

  // ---- one batched read of everything the brain needs (all parallel, no N+1) ----
  const [workers, recentJobs, jobsTotal, jobsToday, completedCount, cancelledCount, openCount, topups, releases, captures] = await Promise.all([
    listWorkers(), // already batches wallets in one query
    prisma.job.findMany({
      take: 300, orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, trade: true, zone: true, createdAt: true, updatedAt: true, acceptedWorkerId: true, commissionPst: true, _count: { select: { bids: true } } },
    }),
    prisma.job.count(),
    prisma.job.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.job.count({ where: { status: 'completed' } }),
    prisma.job.count({ where: { status: 'cancelled' } }),
    prisma.job.count({ where: { status: 'open' } }),
    pendingTopups(),
    pendingReleases(),
    prisma.serviceCreditTxn.findMany({ where: { type: 'capture' }, select: { amountPst: true, createdAt: true } }),
  ]);

  const totalW = workers.length;
  const approvedWorkers = workers.filter((w) => w.verificationStatus === 'approved' && !w.suspended).length;

  // wallet totals
  const totalAvail = workers.reduce((t, w) => t + (w.availablePst || 0), 0);
  const totalHeld = workers.reduce((t, w) => t + (w.heldPst || 0), 0);
  const totalDebt = workers.reduce((t, w) => t + (w.debtPst || 0), 0);

  // capture revenue windows
  const revenueTodayPst = captures.filter((c) => c.createdAt >= dayStart).reduce((t, c) => t + c.amountPst, 0);
  const revenue7dPst = captures.filter((c) => c.createdAt >= d7).reduce((t, c) => t + c.amountPst, 0);
  const revenueTotalPst = captures.reduce((t, c) => t + c.amountPst, 0);

  // ====================================================================
  // HEALTH SCORE — composite of 4 sub-scores, each 0-100, all divide-by-
  // zero guarded with a neutral fallback so an empty platform reads ~70,
  // never NaN. Composite weights: coverage .30, trust .25, throughput .25,
  // liquidity .20 (sum = 1).
  // ====================================================================

  // coverage: % of recent jobs that attracted >=1 bid (is supply reaching demand?)
  const coverage = recentJobs.length
    ? clamp(Math.round((recentJobs.filter((j) => j._count.bids > 0).length / recentJobs.length) * 100))
    : 70;

  // throughput: of finished jobs, how many completed vs cancelled
  const finished = completedCount + cancelledCount;
  const throughput = finished ? clamp(Math.round((completedCount / finished) * 100)) : 70;

  // trust: 60% avg-rating-scaled + 40% inverse of the bad-worker ratio
  // (bad = suspended, or rated < 3.5 with >=2 ratings)
  const rated = workers.filter((w) => (w.ratingCount || 0) > 0 && w.ratingAvg != null);
  const avgRating = rated.length ? rated.reduce((t, w) => t + (w.ratingAvg || 0), 0) / rated.length : null;
  const ratingScore = avgRating != null ? clamp((avgRating / 5) * 100) : 70;
  const badWorkers = workers.filter((w) => w.suspended || (w.ratingAvg != null && w.ratingAvg < 3.5 && (w.ratingCount || 0) >= 2)).length;
  const badRatio = totalW ? badWorkers / totalW : 0;
  const trust = totalW ? clamp(Math.round(0.6 * ratingScore + 0.4 * (100 - badRatio * 100))) : 70;

  // liquidity: 60% inverse-debt-ratio of the whole credit pool + 40% share of debt-free workers
  const pool = totalAvail + totalHeld + totalDebt;
  const debtRatio = pool > 0 ? totalDebt / pool : 0;
  const debtFreeRatio = totalW ? workers.filter((w) => (w.debtPst || 0) <= 0).length / totalW : 1;
  const liquidity = totalW ? clamp(Math.round(0.6 * (1 - debtRatio) * 100 + 0.4 * debtFreeRatio * 100)) : 75;

  const subScores = { coverage, trust, liquidity, throughput };
  const healthScore = clamp(Math.round(0.30 * coverage + 0.25 * trust + 0.25 * throughput + 0.20 * liquidity));

  // ====================================================================
  // PULSE — live top-line vitals
  // ====================================================================
  const activeJobs = recentJobs.filter((j) => j.status === 'accepted' || j.status === 'worker_done').length;
  const pulse = {
    activeJobs,
    openJobs: openCount,
    jobsToday,
    jobsTotal,
    approvedWorkers,
    escrowPst: totalHeld,
    revenueTodayPst,
    revenue7dPst,
    revenueTotalPst,
  };

  // ====================================================================
  // ANOMALIES — auto-detected, sorted by severity
  // ====================================================================
  const anomalies: Array<{ id: string; severity: 'high' | 'med' | 'low'; kind: string; title: string; detail: string; count: number; actionHint: string }> = [];

  // (a) supply gap — open jobs with 0 bids older than ~30m
  const supplyGapJobs = recentJobs.filter((j) => j.status === 'open' && j._count.bids === 0 && now - j.createdAt.getTime() > 30 * MIN);
  if (supplyGapJobs.length) {
    const stale3h = supplyGapJobs.some((j) => now - j.createdAt.getTime() > 3 * HOUR);
    anomalies.push({
      id: 'supply_gap', severity: stale3h ? 'high' : 'med', kind: 'supply_gap',
      title: 'Open jobs with no bids', count: supplyGapJobs.length,
      detail: `${supplyGapJobs.length} open job(s) have gone >30m with zero bids — supply may not be reaching these requests.`,
      actionHint: 'Approve or recruit workers in the affected zones.',
    });
  }

  // (b) stalled escrow — worker_done not confirmed, older than ~24h
  const stalledJobs = recentJobs.filter((j) => j.status === 'worker_done' && now - j.updatedAt.getTime() > DAY);
  if (stalledJobs.length) {
    anomalies.push({
      id: 'stalled_escrow', severity: 'high', kind: 'stalled_escrow',
      title: 'Stalled escrow — awaiting confirmation', count: stalledJobs.length,
      detail: `${stalledJobs.length} job(s) marked done by the worker but unconfirmed for >24h. Commission is locked in escrow.`,
      actionHint: 'Force-complete to capture the commission and release the worker.',
    });
  }

  // (c) liquidity risk — workers carrying debt
  const debtWorkers = workers.filter((w) => (w.debtPst || 0) > 0);
  if (debtWorkers.length) {
    anomalies.push({
      id: 'liquidity_risk', severity: 'med', kind: 'liquidity_risk',
      title: 'Workers carrying commission debt', count: debtWorkers.length,
      detail: `${debtWorkers.length} worker(s) owe a combined EGP ${(totalDebt / 100).toLocaleString('en-US')} in postpaid commission.`,
      actionHint: 'Chase top-ups; consider switching heavy debtors to prepaid.',
    });
  }

  // (d) quality risk — strikes or persistently low ratings
  const qualityWorkers = workers.filter((w) => (w.strikes || 0) >= 1 || (w.ratingAvg != null && w.ratingAvg < 3.5 && (w.ratingCount || 0) >= 2));
  if (qualityWorkers.length) {
    anomalies.push({
      id: 'quality_risk', severity: 'med', kind: 'quality_risk',
      title: 'Workers on quality watch', count: qualityWorkers.length,
      detail: `${qualityWorkers.length} worker(s) have a strike or a rating below 3.5/5 — trust risk to the marketplace.`,
      actionHint: 'Review in Wallets; suspend repeat offenders.',
    });
  }

  // (e) verification backlog
  const vetQueue = workers.filter((w) => w.verificationStatus !== 'approved' && w.verificationStatus !== 'rejected');
  if (vetQueue.length) {
    anomalies.push({
      id: 'verification_backlog', severity: vetQueue.length >= 5 ? 'med' : 'low', kind: 'verification_backlog',
      title: 'Verification backlog', count: vetQueue.length,
      detail: `${vetQueue.length} worker(s) waiting to be interviewed, trialled or approved.`,
      actionHint: 'Clear the queue on the Verification page.',
    });
  }

  // (f) pending top-ups / releases waiting on an admin
  if (topups.length) {
    anomalies.push({
      id: 'pending_topups', severity: 'med', kind: 'pending_topup',
      title: 'Top-ups awaiting confirmation', count: topups.length,
      detail: `${topups.length} manual top-up(s) received but not yet credited to worker wallets.`,
      actionHint: 'Confirm on the Top-ups page to unblock those workers.',
    });
  }
  if (releases.length) {
    anomalies.push({
      id: 'pending_releases', severity: 'low', kind: 'pending_release',
      title: 'Cancellation releases pending', count: releases.length,
      detail: `${releases.length} worker-initiated cancellation(s) awaiting a commission-release decision.`,
      actionHint: 'Review and approve on the Releases page.',
    });
  }

  anomalies.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.count - a.count);

  // ====================================================================
  // DEMAND — per (trade, zone): open jobs vs approved workers, gap desc
  // ====================================================================
  type Cell = { trade: string; zone: string; openJobs: number; approvedWorkers: number; gap: number };
  const cells = new Map<string, Cell>();
  const keyOf = (trade: string, zone: string) => `${norm(trade)}|||${norm(zone)}`;
  for (const j of recentJobs) {
    if (j.status !== 'open') continue;
    const k = keyOf(j.trade, j.zone);
    const c = cells.get(k) || { trade: j.trade, zone: j.zone, openJobs: 0, approvedWorkers: 0, gap: 0 };
    c.openJobs++; cells.set(k, c);
  }
  for (const w of workers) {
    if (w.verificationStatus !== 'approved' || w.suspended) continue;
    if (!w.trade || !w.zone) continue;
    const k = keyOf(w.trade, w.zone);
    const c = cells.get(k) || { trade: w.trade, zone: w.zone, openJobs: 0, approvedWorkers: 0, gap: 0 };
    c.approvedWorkers++; cells.set(k, c);
  }
  const demand = [...cells.values()].map((c) => ({ ...c, gap: c.openJobs - c.approvedWorkers })).sort((a, b) => b.gap - a.gap);

  // ====================================================================
  // RECOMMENDATIONS — concrete one-click actions on REAL existing endpoints
  // (kind:'api' -> call endpoint then reload; kind:'navigate' -> switch CIC page)
  // ====================================================================
  const recommendations: Array<any> = [];

  // stalled worker_done -> force-complete that exact job
  for (const j of stalledJobs.slice(0, 5)) {
    recommendations.push({
      id: `rec-forcecomplete-${j.id}`, priority: 'high', kind: 'stalled_escrow',
      title: 'Force-complete a stalled job',
      detail: `Job ${j.id.slice(-6)} (${j.trade}) has been awaiting customer confirmation for >24h. Force-complete to capture the commission and free the worker.`,
      action: { kind: 'api', endpoint: `/admin/jobs/${j.id}/force-complete`, method: 'POST', body: { note: 'CIC Brain: force-complete — stalled >24h awaiting confirmation' }, label: 'Force complete' },
    });
  }
  // pending top-ups -> confirm
  for (const t of topups.slice(0, 5)) {
    recommendations.push({
      id: `rec-topup-${t.ref}`, priority: 'med', kind: 'pending_topup',
      title: 'Confirm a worker top-up',
      detail: `${t.workerName} sent EGP ${(t.amountPst / 100).toLocaleString('en-US')} via ${t.method} (ref ${t.ref}). Confirm to credit the wallet.`,
      action: { kind: 'api', endpoint: '/admin/topups/confirm', method: 'POST', body: { ref: t.ref }, label: 'Confirm received' },
    });
  }
  // pending releases -> approve
  for (const r of releases.slice(0, 5)) {
    recommendations.push({
      id: `rec-release-${r.jobId}`, priority: 'med', kind: 'pending_release',
      title: 'Approve a cancellation release',
      detail: `Job ${String(r.jobId).slice(-6)} (${r.trade}) — release the EGP ${((r.heldPst || 0) / 100).toLocaleString('en-US')} commission hold${r.contactedBeforeCancel ? ' (flagged — contacted off-app first)' : ''}.`,
      action: { kind: 'api', endpoint: '/admin/releases/approve', method: 'POST', body: { jobId: r.jobId }, label: 'Approve release' },
    });
  }
  // verification backlog -> navigate to the verification page
  if (vetQueue.length) {
    recommendations.push({
      id: 'rec-verification', priority: vetQueue.length >= 5 ? 'high' : 'med', kind: 'verification_backlog',
      title: 'Clear the verification backlog',
      detail: `${vetQueue.length} worker(s) waiting on vetting. Growing supply starts here.`,
      action: { kind: 'navigate', page: 'verification', label: 'Open verification' },
    });
  }
  // undersupplied (trade,zone) -> navigate to verification to approve more workers
  for (const c of demand.filter((x) => x.gap > 0).slice(0, 3)) {
    recommendations.push({
      id: `rec-demand-${keyOf(c.trade, c.zone)}`, priority: 'med', kind: 'supply_gap',
      title: `Undersupplied: ${c.trade} · ${c.zone}`,
      detail: `${c.openJobs} open job(s) vs ${c.approvedWorkers} approved worker(s) here. Recruit or approve workers for this trade/zone.`,
      action: { kind: 'navigate', page: 'verification', label: 'Review workers' },
    });
  }

  recommendations.sort((a, b) => SEV_RANK[b.priority] - SEV_RANK[a.priority]);

  // ====================================================================
  // WORKER RISK — top ~10 by a composite risk score
  // ====================================================================
  const workerRisk = workers
    .map((w) => {
      const reasons: string[] = [];
      let risk = 0;
      if (w.strikes) { risk += w.strikes * 30; reasons.push(`${w.strikes} strike${w.strikes > 1 ? 's' : ''}`); }
      if (w.suspended) { risk += 40; reasons.push('suspended'); }
      if (w.ratingAvg != null && (w.ratingCount || 0) >= 2 && w.ratingAvg < 3.5) { risk += (3.5 - w.ratingAvg) * 20; reasons.push(`low rating ${w.ratingAvg.toFixed(1)}/5`); }
      if ((w.debtPst || 0) > 0) { risk += Math.min(30, Math.round(w.debtPst / 1000)); reasons.push(`debt EGP ${(w.debtPst / 100).toLocaleString('en-US')}`); }
      return {
        id: w.id, name: w.name, trade: w.trade, zone: w.zone,
        rating: w.ratingAvg, strikes: w.strikes || 0, suspended: !!w.suspended, debtPst: w.debtPst || 0,
        risk: Math.round(risk), reason: reasons.join(' · ') || 'clean',
      };
    })
    .filter((w) => w.risk > 0)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 10);

  // ====================================================================
  // FOCUS MODES — definitions only; the UI reweights client-side using these.
  // Each names the anomaly/recommendation kinds it emphasizes.
  // ====================================================================
  const focusModes = {
    growth: { id: 'growth', label: 'Growth', description: 'Prioritise reaching demand — supply gaps and undersupplied trade/zones.', emphasizeKinds: ['supply_gap', 'verification_backlog'] },
    trust: { id: 'trust', label: 'Trust', description: 'Prioritise service quality — quality risk, stalled escrow and vetting.', emphasizeKinds: ['quality_risk', 'stalled_escrow', 'verification_backlog'] },
    liquidity: { id: 'liquidity', label: 'Liquidity', description: 'Prioritise cash health — debt, top-ups, releases and escrow.', emphasizeKinds: ['liquidity_risk', 'pending_topup', 'pending_release', 'stalled_escrow'] },
  };

  return {
    generatedAt: new Date().toISOString(),
    healthScore,
    subScores,
    pulse,
    anomalies,
    demand,
    recommendations,
    workerRisk,
    focusModes,
  };
}
