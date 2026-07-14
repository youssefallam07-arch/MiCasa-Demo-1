import React, { useEffect, useState } from 'react';
import { api, egp, download, getUser, setSession, clearSession } from './api.js';

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
      if (r.user.role !== 'admin') { setErr('Owner access only.'); return; }
      setSession(r.token, r.user); onIn(r.user);
    } catch { setErr('Invalid credentials'); }
  }
  return (
    <div className="login"><div className="box">
      <h1>CENT<b>COM</b></h1><div className="tag">Owner terminal · full control</div>
      <label>Username</label><input value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <label>Password</label><input type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button onClick={go}>Enter</button>
      <div className="err">{err}</div>
    </div></div>
  );
}

function Shell({ user, onOut }) {
  const [page, setPage] = useState('overview');
  const [ov, setOv] = useState(null);
  const [accounts, setAccounts] = useState([]);
  async function load() {
    const ae = document.activeElement;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
    try {
      const [o, r] = await Promise.all([api('/admin/overview'), api('/admin/registry')]);
      setOv(o); setAccounts(r.accounts);
    } catch (e) { if (e.status === 401) onOut(); }
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">CENT<b>COM</b></div><span className="env">OWNER · {user.name}</span>
        <nav>
          <button className={page === 'overview' ? 'on' : ''} onClick={() => setPage('overview')}>Overview</button>
          <button className={page === 'accounts' ? 'on' : ''} onClick={() => setPage('accounts')}>Account Registry{accounts.length ? <span className="bdg">{accounts.length}</span> : null}</button>
          <button className={page === 'launch' ? 'on' : ''} onClick={() => setPage('launch')}>Apps</button>
        </nav>
        <button className="out" onClick={onOut}>Sign out</button>
      </aside>
      <main className="main">
        {page === 'overview' && <Overview ov={ov} accounts={accounts} />}
        {page === 'accounts' && <Registry accounts={accounts} me={user} reload={load} />}
        {page === 'launch' && <Launch />}
      </main>
    </div>
  );
}

const Stat = ({ c, v, l }) => <div className={'stat ' + (c || '')}><b>{v}</b><span>{l}</span></div>;

function Overview({ ov, accounts }) {
  if (!ov) return <div className="empty">Loading…</div>;
  return (
    <>
      <h2 className="title">CENTCOM — Command Overview</h2>
      <div className="sub">The whole platform at a glance. Every account is a real record in the database — persistent until you delete it.</div>
      <div className="stats">
        <Stat c="a" v={ov.totalAccounts} l="Total accounts" />
        <Stat c="a" v={ov.customers} l="Customers" />
        <Stat c="gr" v={ov.workers} l="Workers" />
        <Stat c="g" v={ov.admins} l="Admins" />
        <Stat v={ov.jobs} l="Jobs" />
        <Stat c="gr" v={ov.completed} l="Completed" />
        <Stat c="g" v={'EGP ' + egp(ov.commissionCapturedPst)} l="Commission captured" />
        <Stat c="p" v={ov.pendingVetting} l="Awaiting vetting" />
      </div>
      <div className="card"><h3>Newest accounts</h3><AccountTable accounts={accounts.slice(0, 6)} showActions={false} /></div>
    </>
  );
}

function Registry({ accounts, me, reload }) {
  const [filter, setFilter] = useState('all');
  const roles = ['all', 'customer', 'worker', 'admin'];
  const list = accounts.filter((a) => filter === 'all' || a.role === filter);
  async function del(a) {
    if (!confirm(`Permanently delete "${a.name}" (@${a.username}) and everything they own? This cannot be undone.`)) return;
    try { await api('/admin/users/' + a.id, 'DELETE'); reload(); }
    catch (e) { alert(e.data?.error === 'cannot_delete_last_admin' ? 'Cannot delete the last admin.' : 'Error: ' + (e.data?.error || 'failed')); }
  }
  const [dl, setDl] = useState(false);
  async function excel() {
    setDl(true);
    try { await download('/admin/registry.xlsx', 'micasa-registry.xlsx'); }
    catch { alert('Export failed.'); }
    finally { setDl(false); }
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="title">Account Registry</h2>
          <div className="sub">Every account ever created, recorded and kept until deleted here. Real records — not demo placeholders.</div>
        </div>
        <button className="act" onClick={excel} disabled={dl}>{dl ? 'Building…' : '⬇ Excel'}</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {roles.map((r) => <button key={r} className={'act ' + (filter === r ? '' : 'ghost')} onClick={() => setFilter(r)}>{r === 'all' ? 'All' : r + 's'} {r !== 'all' ? '(' + accounts.filter((a) => a.role === r).length + ')' : '(' + accounts.length + ')'}</button>)}
      </div>
      <div className="card"><AccountTable accounts={list} showActions me={me} onDelete={del} /></div>
    </>
  );
}

function AccountTable({ accounts, showActions, me, onDelete }) {
  if (!accounts.length) return <div className="empty">No accounts.</div>;
  const rolePill = (r) => r === 'admin' ? 'gold' : r === 'worker' ? 'on' : 'blue';
  return (
    <div className="tblwrap"><table>
      <thead><tr><th>Account</th><th>Role</th><th>Phone</th><th>Details</th><th>Created</th>{showActions && <th></th>}</tr></thead>
      <tbody>{accounts.map((a) => (
        <tr key={a.id}>
          <td><b>{a.name}</b><br /><span style={{ color: 'var(--muted)', fontSize: 11 }}>@{a.username}</span></td>
          <td><span className={'pill ' + rolePill(a.role)}>{a.role}</span></td>
          <td>{a.phone || '—'}</td>
          <td style={{ fontSize: 12 }}>
            {a.role === 'worker' && <>
              {a.trade} · {a.zone}<br />
              <span className={'pill ' + (a.verificationStatus === 'approved' ? 'on' : 'warn')} style={{ fontSize: 8 }}>{a.verificationStatus}</span>
              {a.suspended && <span className="pill bad" style={{ fontSize: 8 }}> susp</span>}
              <span style={{ color: 'var(--muted)' }}> · EGP {egp(a.availablePst || 0)} · {a.jobsCompleted} jobs · {a.bidsMade} bids</span>
            </>}
            {a.role === 'customer' && <span style={{ color: 'var(--muted)' }}>{a.jobsPosted} jobs posted</span>}
            {a.role === 'admin' && <span style={{ color: 'var(--muted)' }}>full control</span>}
          </td>
          <td style={{ color: 'var(--muted)', fontSize: 11 }}>{new Date(a.createdAt).toLocaleString()}</td>
          {showActions && <td>{a.id === me.sub ? <span style={{ color: 'var(--muted)', fontSize: 11 }}>you</span> : <button className="act red" onClick={() => onDelete(a)}>Delete</button>}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function Launch() {
  const apps = [
    ['CIC — Admin ops', '/cic/', 'Verification, wallets, top-ups, releases, config'],
    ['Customer app', '/customer/', 'Post jobs, view bids, accept, rate'],
    ['Workers app', '/workers/', 'Job feed, bidding, wallet & earnings'],
  ];
  return (
    <>
      <h2 className="title">Apps</h2><div className="sub">Jump into any surface of the platform.</div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
        {apps.map(([n, href, d]) => (
          <a key={href} href={href} className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <b style={{ fontSize: 15 }}>{n}</b>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>{d}</div>
            <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 12, fontWeight: 700 }}>Open →</div>
          </a>
        ))}
      </div>
    </>
  );
}
