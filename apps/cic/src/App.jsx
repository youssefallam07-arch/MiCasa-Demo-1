import React, { useEffect, useState } from 'react';
import { Brain as LucideBrain, Download as LucideDownload, Star as LucideStar } from 'lucide-react';
import { api, egp, download, getUser, setSession, clearSession } from './api.js';

// Lucide defaults for the whole app: 1.5px stroke, monochrome via currentColor.
// (Aliased — a page component named `Brain` already exists below.)
const IconBrain = (p) => <LucideBrain size={18} strokeWidth={1.5} {...p} />;
const IconDownload = (p) => <LucideDownload size={15} strokeWidth={1.5} {...p} />;
const IconStar = (p) => <LucideStar size={13} strokeWidth={1.5} {...p} />;

export default function App() {
  const [user, setUser] = useState(getUser());
  if (!user || user.role !== 'admin') return <Login onIn={setUser} />;
  return <Shell user={user} onOut={() => { clearSession(); setUser(null); }} />;
}

function Login({ onIn }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('');
  async function go() {
    setErr('');
    try {
      const r = await api('/auth/login', 'POST', { username: u, password: p });
      if (r.user.role !== 'admin') { setErr('Admins only.'); return; }
      setSession(r.token, r.user); onIn(r.user);
    } catch (e) { setErr('Invalid credentials'); }
  }
  return (
    <div className="login"><div className="box">
      <h1>CIC <b>·</b> Control Center</h1><div className="tag">Admin access only</div>
      <label>Username</label><input value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <label>Password</label><input type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button onClick={go}>Sign in</button>
      <div className="err">{err}</div>
    </div></div>
  );
}

function Shell({ user, onOut }) {
  const [page, setPage] = useState('brain');
  const [data, setData] = useState({});
  async function load() {
    const ae = document.activeElement;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
    try {
      const [brain, dash, wallets, topups, releases, jobs, workers, config, audit] = await Promise.all([
        api('/admin/brain'), api('/admin/dashboard'), api('/admin/wallets'), api('/admin/topups'), api('/admin/releases'),
        api('/admin/jobs'), api('/admin/workers'), api('/admin/config'), api('/admin/audit'),
      ]);
      setData({ brain, dash, wallets, topups: topups.topups, releases: releases.releases, jobs: jobs.jobs, workers: workers.workers, config: config.config, audit: audit.events });
    } catch (e) { if (e.status === 401) onOut(); }
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const d = data.dash || {};
  const NAV = [
    ['brain', 'The Brain', 0],
    ['dashboard', 'Dashboard', 0],
    ['verification', 'Verification', d.verificationQueue],
    ['jobs', 'Jobs', 0],
    ['wallets', 'Wallets', 0],
    ['topups', 'Top-ups', d.pendingTopups],
    ['releases', 'Releases', d.pendingReleases],
    ['config', 'Config', 0],
    ['audit', 'Data Log', 0],
    ['password', 'Password', 0],
  ];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Mi<b>Casa</b> CIC</div><span className="env">ADMIN · {user.name}</span>
        <nav>{NAV.map(([id, label, bdg]) => (
          <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>{label}{bdg > 0 && <span className="bdg">{bdg}</span>}</button>
        ))}</nav>
        <button className="out" onClick={onOut}>Sign out</button>
      </aside>
      <main className="main">
        {page === 'brain' && <Brain brain={data.brain} reload={load} setPage={setPage} />}
        {page === 'dashboard' && <Dashboard d={d} jobs={data.jobs || []} />}
        {page === 'verification' && <Verification workers={data.workers || []} reload={load} />}
        {page === 'jobs' && <Jobs jobs={data.jobs || []} reload={load} />}
        {page === 'wallets' && <Wallets wallets={data.wallets} />}
        {page === 'topups' && <Topups topups={data.topups || []} reload={load} />}
        {page === 'releases' && <Releases releases={data.releases || []} reload={load} />}
        {page === 'config' && <Config config={data.config || {}} reload={load} />}
        {page === 'audit' && <AuditLog events={data.audit || []} />}
        {page === 'password' && <Password />}
      </main>
    </div>
  );
}

// ============================ THE BRAIN ============================
// Data-driven intelligence page. All numbers come from GET /admin/brain
// (packages/mainframe/src/brain.ts) — no external LLM. The Casa Brain console
// pattern-matches questions against that live snapshot in askBrain().
const HEALTH_COLOR = (n) => (n >= 75 ? 'var(--green)' : n >= 50 ? 'var(--amber)' : 'var(--red)');
const SUB_META = [
  ['coverage', 'Coverage', 'Recent jobs that drew a bid'],
  ['trust', 'Trust', 'Ratings & worker standing'],
  ['liquidity', 'Liquidity', 'Credit float vs debt'],
  ['throughput', 'Throughput', 'Completed vs cancelled'],
];
const SEV_DOT = { high: 'var(--red)', med: 'var(--amber)', low: 'var(--muted)' };

// Client-side reweight: items whose kind is emphasized by the active focus mode float up.
function reweight(items, emphasizeKinds) {
  return items
    .map((it) => ({ ...it, _emph: emphasizeKinds.includes(it.kind) }))
    .sort((a, b) => (b._emph ? 1 : 0) - (a._emph ? 1 : 0));
}

// Data-driven natural-language responder. Swap the body for a Claude API call later
// (keep the signature) to enable full reasoning — everything it needs is in `brain`.
function askBrain(question, brain) {
  if (!brain) return 'The Brain is still loading — try again in a moment.';
  const s = (question || '').toLowerCase().trim();
  const has = (...ws) => ws.some((w) => s.includes(w));
  const m = (p) => 'EGP ' + egp(p);
  if (!s) return 'Ask me about health, supply/zones, worker risk, money/liquidity, today\'s activity, or what to do next.';
  if (has('health', 'how are we', 'how we doing', 'overall', 'summary', 'status')) {
    const subs = brain.subScores;
    const weakest = Object.entries(subs).sort((a, b) => a[1] - b[1])[0];
    return `Platform health is ${brain.healthScore}/100. Weakest driver is ${weakest[0]} at ${weakest[1]}/100 — focus there. (coverage ${subs.coverage} · trust ${subs.trust} · liquidity ${subs.liquidity} · throughput ${subs.throughput})`;
  }
  if (has('zone', 'supply', 'worker', 'undersupplied', 'demand', 'recruit', 'coverage')) {
    const gaps = brain.demand.filter((d) => d.gap > 0).slice(0, 3);
    if (!gaps.length) return 'No undersupplied trade/zones right now — open jobs are covered by approved workers.';
    return 'Most undersupplied: ' + gaps.map((d) => `${d.trade} in ${d.zone} (${d.openJobs} open vs ${d.approvedWorkers} workers, gap ${d.gap})`).join('; ') + '. Approve or recruit workers there.';
  }
  if (has('risk', 'suspend', 'strike', 'quality', 'worst', 'bad worker')) {
    const wr = brain.workerRisk.slice(0, 5);
    if (!wr.length) return 'No workers flagged for risk — no strikes, suspensions, low ratings or debt.';
    return 'Highest-risk workers: ' + wr.map((w) => `${w.name} (${w.reason})`).join('; ') + '.';
  }
  if (has('money', 'liquid', 'debt', 'escrow', 'cash', 'wallet', 'credit')) {
    const p = brain.pulse;
    return `Liquidity sub-score ${brain.subScores.liquidity}/100. Escrow held ${m(p.escrowPst)}. Commission captured to date ${m(p.revenueTotalPst)}.` + (brain.anomalies.some((a) => a.kind === 'liquidity_risk') ? ' Some workers carry commission debt — see Diagnose.' : '');
  }
  if (has('today', 'revenue', 'earn', 'activity', 'jobs today')) {
    const p = brain.pulse;
    return `Today: ${p.jobsToday} job(s) posted, ${p.activeJobs} active, ${p.openJobs} open. Commission today ${m(p.revenueTodayPst)}, last 7 days ${m(p.revenue7dPst)}.`;
  }
  if (has('anomal', 'wrong', 'problem', 'alert', 'issue')) {
    if (!brain.anomalies.length) return 'No anomalies detected — the platform is clean right now.';
    return 'Top issues: ' + brain.anomalies.slice(0, 3).map((a) => `${a.title} (${a.severity}, ${a.count})`).join('; ') + '.';
  }
  if (has('recommend', 'what should', 'do next', 'action', 'todo', 'next')) {
    if (!brain.recommendations.length) return 'No pending recommendations — nothing needs a one-click action right now.';
    return 'Suggested next actions: ' + brain.recommendations.slice(0, 3).map((r) => r.title).join('; ') + '. Use the Act panel to execute.';
  }
  return `I read live platform data. Try: "how's our health?", "which zones need workers?", "who's high risk?", "how's our liquidity?", or "what should I do next?". Health is ${brain.healthScore}/100 right now.`;
}

function Ring({ score }) {
  const R = 54, C = 2 * Math.PI * R, off = C * (1 - score / 100), col = HEALTH_COLOR(score);
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="ring">
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line2)" strokeWidth="12" />
      <circle cx="70" cy="70" r={R} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset .6s ease' }} />
      <text x="70" y="66" textAnchor="middle" fontSize="34" fontWeight="800" fill={col}>{score}</text>
      <text x="70" y="90" textAnchor="middle" fontSize="10" letterSpacing="1.5" fill="var(--muted)">/ 100</text>
    </svg>
  );
}

function Brain({ brain, reload, setPage }) {
  const [focus, setFocus] = useState(() => localStorage.getItem('cic_focus') || 'growth');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState(false); // true when the answer came from Claude (not the local responder)
  useEffect(() => { localStorage.setItem('cic_focus', focus); }, [focus]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);

  if (!brain) return <div className="empty">Waking the Brain…</div>;
  const emphasize = (brain.focusModes[focus] || {}).emphasizeKinds || [];
  const anomalies = reweight(brain.anomalies, emphasize);
  const recommendations = reweight(brain.recommendations, emphasize);

  async function act(rec) {
    const a = rec.action;
    if (a.kind === 'navigate') { setPage(a.page); return; }
    if (!window.confirm(`${a.label}?\n\n${rec.detail}`)) return;
    setBusy(rec.id);
    try { const r = await api(a.endpoint, a.method || 'POST', a.body); setToast('✓ ' + a.label + ' — ' + (r.status || r.ok ? 'done' : JSON.stringify(r).slice(0, 60))); await reload(); }
    catch (e) { setToast('✗ ' + (e.data?.error || 'failed')); }
    finally { setBusy(''); }
  }
  // Try the server's Casa AI (Claude) first; fall back to the local data-driven
  // responder if no API key is configured server-side or the call fails.
  async function runAsk(question) {
    const query = (question ?? q).trim();
    if (!query) return;
    setQ(query);
    setAsking(true);
    try {
      const r = await api('/admin/brain/ask', 'POST', { question: query });
      if (r.source === 'claude' && r.answer) { setAnswer(r.answer); setAiAnswer(true); }
      else { setAnswer(askBrain(query, brain)); setAiAnswer(false); }
    } catch {
      setAnswer(askBrain(query, brain)); setAiAnswer(false);
    } finally { setAsking(false); }
  }

  const p = brain.pulse;
  return (
    <>
      <div className="brain-top">
        <div>
          <h2 className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconBrain size={22} />The Brain</h2>
          <div className="sub">Live intelligence · sense → diagnose → predict → act · refreshes every 5s</div>
        </div>
        <div className="focus-tabs">
          {Object.values(brain.focusModes).map((mo) => (
            <button key={mo.id} className={focus === mo.id ? 'on' : ''} onClick={() => setFocus(mo.id)} title={mo.description}>{mo.label}</button>
          ))}
        </div>
      </div>

      {toast && <div className="brain-toast">{toast}</div>}

      <div className="card brain-hero">
        <div className="hero-ring"><Ring score={brain.healthScore} /><div className="hero-label">Platform Health</div></div>
        <div className="subs">
          {SUB_META.map(([k, label, hint]) => {
            const v = brain.subScores[k] ?? 0;
            return (
              <div key={k} className="meter">
                <div className="meter-h"><span>{label}</span><b style={{ color: HEALTH_COLOR(v) }}>{v}</b></div>
                <div className="meter-bar"><div style={{ width: v + '%', background: HEALTH_COLOR(v) }} /></div>
                <div className="meter-hint">{hint}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SENSE */}
      <div className="lens">
        <div className="lens-head"><span className="lens-tag sense">SENSE</span><span className="lens-desc">What the platform is doing right now</span></div>
        <div className="stats">
          <Stat c="a" v={p.jobsToday} l="Jobs today" />
          <Stat v={p.activeJobs} l="Active jobs" />
          <Stat c="p" v={p.openJobs} l="Open jobs" />
          <Stat c="gr" v={p.approvedWorkers} l="Approved workers" />
          <Stat c="gold" v={'EGP ' + egp(p.escrowPst)} l="In escrow" />
          <Stat c="g" v={'EGP ' + egp(p.revenueTodayPst)} l="Commission today" />
          <Stat c="g" v={'EGP ' + egp(p.revenue7dPst)} l="Commission · 7d" />
          <Stat v={p.jobsTotal} l="Jobs all-time" />
        </div>
      </div>

      {/* DIAGNOSE */}
      <div className="lens">
        <div className="lens-head"><span className="lens-tag diagnose">DIAGNOSE</span><span className="lens-desc">Anomaly radar · {focus} focus first</span></div>
        <div className="card">
          {anomalies.length === 0 ? <div className="empty">No anomalies — the platform is clean.</div> :
            anomalies.map((a) => (
              <div key={a.id} className={'anom' + (a._emph ? ' emph' : '')}>
                <span className="dot" style={{ background: SEV_DOT[a.severity] }} />
                <div className="anom-body">
                  <div className="anom-title">{a.title} <span className="pill off">{a.count}</span>{a._emph && <span className="pill gold">FOCUS</span>}</div>
                  <div className="anom-detail">{a.detail}</div>
                  <div className="anom-hint">→ {a.actionHint}</div>
                </div>
                <span className={'sev sev-' + a.severity}>{a.severity}</span>
              </div>
            ))}
        </div>
      </div>

      {/* PREDICT */}
      <div className="lens">
        <div className="lens-head"><span className="lens-tag predict">PREDICT</span><span className="lens-desc">Demand vs supply by trade & zone</span></div>
        <div className="card">
          {brain.demand.length === 0 ? <div className="empty">No demand data yet.</div> :
            <div className="tblwrap"><table>
              <thead><tr><th>Trade</th><th>Zone</th><th>Open jobs</th><th>Approved workers</th><th>Gap</th></tr></thead>
              <tbody>{brain.demand.map((d, i) => (
                <tr key={i} className={d.gap > 0 ? 'undersupplied' : ''}>
                  <td><b>{d.trade}</b></td><td>{d.zone}</td><td>{d.openJobs}</td><td>{d.approvedWorkers}</td>
                  <td>{d.gap > 0 ? <span className="pill bad">+{d.gap} short</span> : <span className="pill on">covered</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>}
        </div>
      </div>

      {/* ACT */}
      <div className="lens">
        <div className="lens-head"><span className="lens-tag act">ACT</span><span className="lens-desc">One-click actions on real endpoints · {focus} focus first</span></div>
        <div className="card">
          {recommendations.length === 0 ? <div className="empty">Nothing to act on — no recommendations right now.</div> :
            recommendations.map((r) => (
              <div key={r.id} className={'rec' + (r._emph ? ' emph' : '')}>
                <div className="rec-body">
                  <div className="rec-title"><span className={'sev sev-' + (r.priority === 'high' ? 'high' : r.priority === 'med' ? 'med' : 'low')}>{r.priority}</span> {r.title}{r._emph && <span className="pill gold">FOCUS</span>}</div>
                  <div className="rec-detail">{r.detail}</div>
                </div>
                <button className={'act ' + (r.action.kind === 'navigate' ? 'ghost' : 'green')} disabled={busy === r.id} onClick={() => act(r)}>
                  {busy === r.id ? '…' : r.action.label}
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* CASA BRAIN CONSOLE */}
      <div className="lens">
        <div className="lens-head"><span className="lens-tag casa">CASA BRAIN</span><span className="lens-desc">Ask about the platform in plain language</span></div>
        <div className="card">
          <div className="casa-note">Ask about the platform in plain language — answered over live data. With a Claude API key set on the server, Casa reasons with the full model; otherwise it answers from the built-in engine.</div>
          <div className="casa-in">
            <input value={q} placeholder="e.g. how's our health? · which zones need workers? · who's high risk?"
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runAsk()} disabled={asking} />
            <button className="act" onClick={() => runAsk()} disabled={asking}>{asking ? '…' : 'Ask'}</button>
          </div>
          {answer && <div className="casa-out">{aiAnswer && <span className="pill gold">Casa AI</span>} {answer}</div>}
          <div className="casa-chips">
            {["How's our health?", 'Which zones need workers?', "Who's high risk?", "How's our liquidity?", 'What should I do next?'].map((c) => (
              <button key={c} className="chip" disabled={asking} onClick={() => runAsk(c)}>{c}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const Stat = ({ c, v, l }) => <div className={'stat ' + (c || '')}><b>{v}</b><span>{l}</span></div>;

function Dashboard({ d, jobs }) {
  return (
    <>
      <h2 className="title">Command Dashboard</h2><div className="sub">Live platform state · refreshes every 5s</div>
      <div className="stats">
        <Stat c="a" v={d.jobsToday ?? 0} l="Jobs today" />
        <Stat v={d.jobsTotal ?? 0} l="Jobs total" />
        <Stat v={d.bidsPerJob ?? 0} l="Bids / job" />
        <Stat c="gr" v={(d.completionRate ?? 0) + '%'} l="Completion rate" />
        <Stat c="g" v={'EGP ' + egp(d.commissionCapturedPst ?? 0)} l="Commission captured" />
        <Stat v={d.workers ?? 0} l="Workers" />
        <Stat c="r" v={d.pendingReleases ?? 0} l="Pending releases" />
        <Stat c="p" v={d.verificationQueue ?? 0} l="Awaiting vetting" />
      </div>
      <div className="card"><h3>Recent jobs</h3><JobsTable jobs={jobs.slice(0, 8)} /></div>
    </>
  );
}

function JobsTable({ jobs, reload }) {
  if (!jobs.length) return <div className="empty">No jobs.</div>;
  const canOverride = (s) => ['accepted', 'worker_done', 'cancel_pending'].includes(s);
  async function override(j, kind) {
    const note = window.prompt(kind === 'complete'
      ? 'Reason to force-COMPLETE (captures the commission):'
      : 'Reason to force-CANCEL (releases the commission):');
    if (!note || note.trim().length < 3) return;
    try { await api(`/admin/jobs/${j.id}/force-${kind}`, 'POST', { note: note.trim() }); reload && reload(); }
    catch (e) { alert('Error: ' + (e.data?.error || 'failed')); }
  }
  return (
    <div className="tblwrap"><table>
      <thead><tr><th>Trade</th><th>Zone</th><th>Urgency</th><th>Budget</th><th>Commission</th><th>Bids</th><th>Customer</th><th>Status</th>{reload && <th>Override</th>}</tr></thead>
      <tbody>{jobs.map((j) => (
        <tr key={j.id}>
          <td><b>{j.trade}</b></td><td>{j.zone}</td>
          <td>{j.urgency === 'priority' ? <span className="pill bad">PRIORITY</span> : 'standard'}</td>
          <td className="money">EGP {egp(j.budgetOfferPst)}</td>
          <td className="money">{j.commissionPst ? 'EGP ' + egp(j.commissionPst) : '—'}</td>
          <td>{j.bidCount}</td><td>{j.customer}</td>
          <td><span className={'pill ' + statusPill(j.status)}>{j.status}</span></td>
          {reload && <td>{canOverride(j.status)
            ? <div style={{ display: 'flex', gap: 6 }}>
                <button className="act green" onClick={() => override(j, 'complete')} title="Capture commission, mark completed">Force complete</button>
                <button className="act red" onClick={() => override(j, 'cancel')} title="Release commission, mark cancelled">Force cancel</button>
              </div>
            : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}
const statusPill = (s) => ({ open: 'blue', accepted: 'warn', worker_done: 'gold', completed: 'on', cancelled: 'bad', cancel_pending: 'bad' }[s] || 'off');

function Verification({ workers, reload }) {
  const queue = workers.filter((w) => w.verificationStatus !== 'approved' && w.verificationStatus !== 'rejected');
  async function set(id, status) { await api(`/admin/workers/${id}/verify`, 'POST', { status }); reload(); }
  return (
    <>
      <h2 className="title">Worker Verification</h2><div className="sub">Founder-led vetting — interview, trial, then approve.</div>
      <div className="card">
        {queue.length === 0 ? <div className="empty">No workers awaiting verification.</div> :
          <div className="tblwrap"><table>
            <thead><tr><th>Worker</th><th>Trade</th><th>Zone</th><th>Phone</th><th>Stage</th><th>Advance</th></tr></thead>
            <tbody>{queue.map((w) => (
              <tr key={w.id}>
                <td><b>{w.name}</b><br /><span style={{ color: 'var(--muted)', fontSize: 11 }}>@{w.username}</span></td>
                <td>{w.trade}</td><td>{w.zone}</td><td>{w.phone || '—'}</td>
                <td><span className="pill warn">{w.verificationStatus}</span></td>
                <td>
                  <button className="act" onClick={() => set(w.id, 'interviewed')}>Interview</button>
                  <button className="act" onClick={() => set(w.id, 'trial')}>Trial</button>
                  <button className="act green" onClick={() => set(w.id, 'approved')}>Approve</button>
                  <button className="act red" onClick={() => set(w.id, 'rejected')}>Reject</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>}
      </div>
    </>
  );
}

function Jobs({ jobs, reload }) {
  return <><h2 className="title">Jobs</h2><div className="sub">All jobs across the platform. Use overrides to force a stuck job to a terminal state (a reason is logged to the ledger).</div><div className="card"><JobsTable jobs={jobs} reload={reload} /></div></>;
}

const AUDIT_PILL = { 'account.created': 'blue', 'account.deleted': 'bad', 'account.password_set': 'warn', 'worker.verification': 'blue', 'worker.suspended': 'bad', 'job.posted': 'blue', 'bid.placed': 'off', 'job.accepted': 'warn', 'job.worker_done': 'gold', 'job.completed': 'on', 'job.cancelled': 'bad', 'job.cancel_requested': 'bad', 'job.rated': 'gold', 'config.changed': 'gold', 'wallet.topup_confirmed': 'on' };
function AuditLog({ events }) {
  const [dl, setDl] = useState(false);
  async function excel() {
    setDl(true);
    try { await download('/admin/registry.xlsx', 'micasa-data-log.xlsx'); }
    catch { alert('Export failed.'); }
    finally { setDl(false); }
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="title">Data Log</h2>
          <div className="sub">Every change recorded while online — accounts, jobs, bids, wallets, config. {events.length} events · newest first. Downloads as the full Excel (Audit Log sheet).</div>
        </div>
        <button className="act" onClick={excel} disabled={dl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{dl ? 'Building…' : <><IconDownload />Excel</>}</button>
      </div>
      <div className="card"><div className="tblwrap"><table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
        <tbody>{events.length ? events.map((e, i) => (
          <tr key={e.id || i}>
            <td className="mini" style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{new Date(e.at).toLocaleString()}</td>
            <td><b>{e.actor}</b></td>
            <td><span className={'pill ' + (AUDIT_PILL[e.action] || 'off')}>{e.action}</span></td>
            <td style={{ fontSize: 12 }}>{e.target || '—'}</td>
            <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.detail || ''}</td>
          </tr>
        )) : <tr><td colSpan="5" className="empty">No events recorded yet.</td></tr>}</tbody>
      </table></div></div>
    </>
  );
}

function Wallets({ wallets }) {
  if (!wallets) return <div className="empty">Loading…</div>;
  const t = wallets.totals;
  return (
    <>
      <h2 className="title">Service Credit — Wallets</h2><div className="sub">Prepaid commission credit per worker.</div>
      <div className="stats">
        <Stat c="gr" v={'EGP ' + egp(t.available)} l="Credit float" />
        <Stat c="g" v={'EGP ' + egp(t.held)} l="In escrow (held)" />
        <Stat c="r" v={'EGP ' + egp(t.debt)} l="Outstanding debt" />
        <Stat c="a" v={'EGP ' + egp(t.commissionCaptured)} l="Commission captured" />
      </div>
      <div className="card"><h3>Per-worker</h3>
        <div className="tblwrap"><table>
          <thead><tr><th>Worker</th><th>Verified</th><th>Mode</th><th>Available</th><th>Held</th><th>Debt</th><th>Jobs</th><th>Rating</th><th>Strikes</th></tr></thead>
          <tbody>{wallets.workers.map((w) => (
            <tr key={w.id}>
              <td><b>{w.name}</b></td>
              <td>{w.suspended ? <span className="pill bad">SUSPENDED</span> : <span className={'pill ' + (w.verificationStatus === 'approved' ? 'on' : 'warn')}>{w.verificationStatus}</span>}</td>
              <td><span className={'pill ' + (w.walletMode === 'prepaid' ? 'blue' : 'gold')}>{w.walletMode}</span></td>
              <td className="money" style={{ color: 'var(--green)' }}>EGP {egp(w.availablePst)}</td>
              <td className="money" style={{ color: 'var(--gold)' }}>EGP {egp(w.heldPst)}</td>
              <td className="money" style={{ color: 'var(--red)' }}>{w.debtPst ? 'EGP ' + egp(w.debtPst) : '—'}</td>
              <td>{w.jobsCompleted}</td>
              <td>{w.ratingCount ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconStar style={{ fill: 'currentColor' }} />{w.ratingAvg.toFixed(1)}</span> : '—'}</td>
              <td>{w.strikes}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}

function Topups({ topups, reload }) {
  async function confirm(ref) { await api('/admin/topups/confirm', 'POST', { ref }); reload(); }
  return (
    <>
      <h2 className="title">Manual Top-up Confirmations</h2><div className="sub">Confirm a received Vodafone Cash / InstaPay transfer to credit the worker.</div>
      <div className="card">
        {topups.length === 0 ? <div className="empty">No pending top-ups.</div> :
          <div className="tblwrap"><table>
            <thead><tr><th>Ref</th><th>Worker</th><th>Amount</th><th>Method</th><th></th></tr></thead>
            <tbody>{topups.map((t) => (
              <tr key={t.ref}><td style={{ fontFamily: 'monospace' }}>{t.ref}</td><td>{t.workerName}</td><td className="money">EGP {egp(t.amountPst)}</td><td>{t.method}</td>
                <td><button className="act green" onClick={() => confirm(t.ref)}>Confirm received</button></td></tr>
            ))}</tbody>
          </table></div>}
      </div>
    </>
  );
}

function Releases({ releases, reload }) {
  async function approve(jobId) { await api('/admin/releases/approve', 'POST', { jobId }); reload(); }
  return (
    <>
      <h2 className="title">Pending Cancellation Releases</h2><div className="sub">Worker-initiated cancels — release the commission hold after review.</div>
      <div className="card">
        {releases.length === 0 ? <div className="empty">No pending releases.</div> :
          <div className="tblwrap"><table>
            <thead><tr><th>Job</th><th>Trade</th><th>Worker</th><th>Held</th><th>Contacted first?</th><th></th></tr></thead>
            <tbody>{releases.map((r) => (
              <tr key={r.jobId}><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.jobId.slice(-6)}</td><td>{r.trade}</td><td>{r.workerName}</td>
                <td className="money">EGP {egp(r.heldPst)}</td>
                <td>{r.contactedBeforeCancel ? <span className="pill bad">YES — off-app risk</span> : <span className="pill on">no</span>}</td>
                <td><button className="act" onClick={() => approve(r.jobId)}>Approve release</button></td></tr>
            ))}</tbody>
          </table></div>}
      </div>
    </>
  );
}

const CFG_META = {
  commission_standard: 'Standard commission %', commission_priority: 'Priority commission %',
  min_topup: 'Min top-up (piasters)', postpaid_job_limit: 'Postpaid grace jobs',
  cancel_threshold: 'Cancels/30d before strike', max_strikes: 'Strikes before suspend',
};
function Config({ config, reload }) {
  const [local, setLocal] = useState(config);
  useEffect(() => { setLocal(config); }, [JSON.stringify(config)]);
  async function save() { for (const k of Object.keys(local)) { if (local[k] !== config[k]) await api('/admin/config', 'POST', { key: k, value: String(local[k]) }); } reload(); }
  return (
    <>
      <h2 className="title">Config</h2><div className="sub">Every business rule reads from here — nothing hardcoded.</div>
      <div className="card">
        <div className="cfg">{Object.keys(CFG_META).map((k) => (
          <div key={k}><label>{CFG_META[k]}</label><input value={local[k] ?? ''} onChange={(e) => setLocal({ ...local, [k]: e.target.value })} /><div className="hint">key: {k}</div></div>
        ))}</div>
        <button className="save" onClick={save}>Save config</button>
      </div>
    </>
  );
}

function Password() {
  const [f, setF] = useState({ oldPassword: '', newPassword: '' }); const [msg, setMsg] = useState('');
  async function save() {
    setMsg('');
    try { await api('/admin/change-password', 'POST', f); setMsg('Password updated.'); setF({ oldPassword: '', newPassword: '' }); }
    catch (e) { setMsg(e.data?.error === 'wrong_password' ? 'Current password is wrong' : 'Error'); }
  }
  return (
    <>
      <h2 className="title">Change Password</h2><div className="sub">Change the seeded admin password after first login.</div>
      <div className="card pwform">
        <input type="password" placeholder="Current password" value={f.oldPassword} onChange={(e) => setF({ ...f, oldPassword: e.target.value })} />
        <input type="password" placeholder="New password (min 6)" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
        <button className="save" onClick={save}>Update password</button>
        <div style={{ color: 'var(--green)', fontSize: 12.5, marginTop: 12 }}>{msg}</div>
      </div>
    </>
  );
}
