import React, { useEffect, useState } from 'react';
import { api, egp, getUser, setSession, clearSession } from './api.js';

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
  const [page, setPage] = useState('dashboard');
  const [data, setData] = useState({});
  async function load() {
    const ae = document.activeElement;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
    try {
      const [dash, wallets, topups, releases, jobs, workers, config] = await Promise.all([
        api('/admin/dashboard'), api('/admin/wallets'), api('/admin/topups'), api('/admin/releases'),
        api('/admin/jobs'), api('/admin/workers'), api('/admin/config'),
      ]);
      setData({ dash, wallets, topups: topups.topups, releases: releases.releases, jobs: jobs.jobs, workers: workers.workers, config: config.config });
    } catch (e) { if (e.status === 401) onOut(); }
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const d = data.dash || {};
  const NAV = [
    ['dashboard', 'Dashboard', 0],
    ['verification', 'Verification', d.verificationQueue],
    ['jobs', 'Jobs', 0],
    ['wallets', 'Wallets', 0],
    ['topups', 'Top-ups', d.pendingTopups],
    ['releases', 'Releases', d.pendingReleases],
    ['config', 'Config', 0],
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
        {page === 'dashboard' && <Dashboard d={d} jobs={data.jobs || []} />}
        {page === 'verification' && <Verification workers={data.workers || []} reload={load} />}
        {page === 'jobs' && <Jobs jobs={data.jobs || []} reload={load} />}
        {page === 'wallets' && <Wallets wallets={data.wallets} />}
        {page === 'topups' && <Topups topups={data.topups || []} reload={load} />}
        {page === 'releases' && <Releases releases={data.releases || []} reload={load} />}
        {page === 'config' && <Config config={data.config || {}} reload={load} />}
        {page === 'password' && <Password />}
      </main>
    </div>
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
              <td>{w.ratingCount ? '★ ' + w.ratingAvg.toFixed(1) : '—'}</td>
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
