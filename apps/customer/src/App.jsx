import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, Star } from 'lucide-react';
import { api, egp, toPst, getUser, setSession, clearSession } from './api.js';

const TRADES = [['plumbing', 'سباكة'], ['electrical', 'كهرباء'], ['ac', 'تكييف'], ['carpentry', 'نجارة'], ['painting', 'دهانات'], ['appliance', 'أجهزة'], ['handyman', 'صنايعي']];
const ZONES = ['المعادي', 'مدينة نصر', 'الزمالك', 'مصر الجديدة'];
const trAr = (t) => (TRADES.find((x) => x[0] === t) || [t, t])[1];
const STATUS_AR = { open: 'مفتوح', accepted: 'الفني بيشتغل', worker_done: 'الفني خلّص', completed: 'مكتمل', cancel_pending: 'طلب إلغاء', cancelled: 'ملغي' };

const Logo = () => (
  <svg className="logo" viewBox="0 0 200 200"><path d="M40 95 L100 42 L160 95" fill="none" stroke="#DDE9FF" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /><path d="M55 92 L55 158 L145 158 L145 92" fill="none" stroke="#4D9FFF" strokeWidth="14" strokeLinecap="round" /><path d="M78 158 L78 112 L100 134 L122 112 L122 158" fill="none" stroke="#D9B36A" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function App() {
  const [user, setUser] = useState(getUser());
  if (!user) return <Auth onIn={(u) => setUser(u)} />;
  return <Main user={user} onOut={() => { clearSession(); setUser(null); }} />;
}

function Auth({ onIn }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ username: '', password: '', name: '', phone: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go() {
    setErr('');
    try {
      if (mode === 'register') {
        if (f.name.length < 2 || f.username.length < 3 || f.password.length < 6) { setErr('املأ البيانات (باسورد ٦ حروف على الأقل)'); return; }
        const r = await api('/auth/register', 'POST', { role: 'customer', username: f.username, password: f.password, name: f.name, phone: f.phone });
        setSession(r.token, r.user); onIn(r.user);
      } else {
        const r = await api('/auth/login', 'POST', { username: f.username, password: f.password });
        setSession(r.token, r.user); onIn(r.user);
      }
    } catch (e) { setErr(e.data?.error === 'invalid_credentials' ? 'بيانات الدخول غلط' : e.data?.error === 'username_taken' ? 'اسم المستخدم موجود' : 'حصل خطأ'); }
  }
  return (
    <div className="authwrap">
      <Logo /><h1>Mi<b>Casa</b></h1><p>اطلب صنايعي موثوق — بالمزايدة</p>
      <div className="tabs"><button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>دخول</button><button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>حساب جديد</button></div>
      {mode === 'register' && <><div className="fld"><label>الاسم</label><input value={f.name} onChange={set('name')} /></div><div className="fld"><label>رقم الموبايل</label><input value={f.phone} onChange={set('phone')} /></div></>}
      <div className="fld"><label>اسم المستخدم</label><input value={f.username} onChange={set('username')} autoComplete="username" /></div>
      <div className="fld"><label>كلمة المرور</label><input type="password" value={f.password} onChange={set('password')} /></div>
      <button className="btn" onClick={go}>{mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
      <div className="err">{err}</div>
    </div>
  );
}

function Main({ user, onOut }) {
  const [tab, setTab] = useState('jobs');
  const [screen, setScreen] = useState(null); // {name:'bids'|'rate', job}
  const [jobs, setJobs] = useState([]);
  const load = () => api('/customer/jobs').then((r) => setJobs(r.jobs)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  if (screen?.name === 'bids') return <Bids job={screen.job} back={() => { setScreen(null); load(); }} />;
  if (screen?.name === 'rate') return <Rate job={screen.job} back={() => { setScreen(null); load(); }} />;

  return (
    <>
      <div className="topbar"><Logo /><h1>Mi<b style={{ color: 'var(--accent)' }}>Casa</b><div className="sub">أهلاً {user.name}</div></h1><button className="btn ghost sm" onClick={onOut}>خروج</button></div>
      <div className="wrap">
        {tab === 'post' ? <PostJob done={() => { setTab('jobs'); load(); }} />
          : (<>
            <div className="sec">طلباتي</div>
            {jobs.length === 0 && <div className="empty">لسه مفيش طلبات — اضغط «اطلب خدمة»</div>}
            {jobs.map((j) => <JobCard key={j.id} job={j} open={() => setScreen({ name: 'bids', job: j })} rate={() => setScreen({ name: 'rate', job: j })} reload={load} />)}
          </>)}
      </div>
      <div className="nav">
        <button className={tab === 'jobs' ? 'on' : ''} onClick={() => setTab('jobs')}><ClipboardList size={20} strokeWidth={1.5} /><span>طلباتي</span></button>
        <button className={tab === 'post' ? 'on' : ''} onClick={() => setTab('post')}><Plus size={20} strokeWidth={1.5} /><span>اطلب خدمة</span></button>
      </div>
    </>
  );
}

function JobCard({ job, open, rate, reload }) {
  const [busy, setBusy] = useState(false);
  async function act(fn) { setBusy(true); try { await fn(); } catch (e) { alert(e.data?.error || 'خطأ'); } setBusy(false); reload(); }
  return (
    <div className="card">
      <div className="jt"><b>{trAr(job.trade)}</b>{job.urgency === 'priority' && <span className="pill priority">طوارئ</span>}<span className={'pill ' + job.status}>{STATUS_AR[job.status]}</span></div>
      <div className="muted" style={{ marginBottom: 8 }}>{job.description}</div>
      <div className="muted">المنطقة: {job.zone} · ميزانيتك <span className="money">{egp(job.budgetOfferPst)}</span> ج</div>
      <div style={{ marginTop: 12 }}>
        {job.status === 'open' && <>
          <button className="btn sm" onClick={open}>شوف العروض ({job.bids?.length || 0})</button>
          <button className="btn sm ghost" disabled={busy} onClick={() => { if (confirm('تلغي الطلب؟')) act(() => api(`/customer/jobs/${job.id}/cancel`, 'POST', { contacted: false })); }}>إلغاء الطلب</button>
        </>}
        {job.status === 'worker_done' && <button className="btn sm green" disabled={busy} onClick={() => act(() => api(`/customer/jobs/${job.id}/confirm-complete`, 'POST'))}>أكّد إن الشغل خلص</button>}
        {job.status === 'accepted' && <>
          <span className="muted">الفني في الطريق / بيشتغل…</span>
          <button className="btn sm ghost" disabled={busy} onClick={() => { if (confirm('تطلب إلغاء الشغل؟ الفني لازم يأكّد.')) act(() => api(`/customer/jobs/${job.id}/cancel`, 'POST', { contacted: false })); }}>اطلب إلغاء</button>
        </>}
        {job.status === 'cancel_pending' && (job.cancelledBy === 'worker'
          ? <button className="btn sm ghost" disabled={busy} onClick={() => act(() => api(`/customer/jobs/${job.id}/confirm-cancel`, 'POST'))}>الفني طلب إلغاء — أكّد</button>
          : <span className="muted">في انتظار تأكيد الفني للإلغاء…</span>)}
        {job.status === 'completed' && <button className="btn sm gold" onClick={rate}>قيّم الفني</button>}
      </div>
    </div>
  );
}

function PostJob({ done }) {
  const [f, setF] = useState({ trade: 'plumbing', description: '', zone: 'المعادي', budget: '', urgency: 'standard' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setErr('');
    if (f.description.length < 3 || !f.budget) { setErr('اكتب وصف وميزانية'); return; }
    try { await api('/customer/jobs', 'POST', { trade: f.trade, description: f.description, zone: f.zone, budgetOfferPst: toPst(f.budget), urgency: f.urgency }); done(); }
    catch (e) { setErr(e.data?.error || 'خطأ'); }
  }
  return (
    <>
      <div className="sec">اطلب خدمة</div>
      <div className="card">
        <div className="fld"><label>نوع الخدمة</label><select value={f.trade} onChange={set('trade')}>{TRADES.map(([v, a]) => <option key={v} value={v}>{a}</option>)}</select></div>
        <div className="fld"><label>اوصف المشكلة</label><textarea rows="3" value={f.description} onChange={set('description')} placeholder="مثلاً: حنفية المطبخ بتنقّط" /></div>
        <div className="row">
          <div className="fld"><label>المنطقة</label><select value={f.zone} onChange={set('zone')}>{ZONES.map((z) => <option key={z} value={z}>{z}</option>)}</select></div>
          <div className="fld"><label>ميزانيتك (ج)</label><input type="number" value={f.budget} onChange={set('budget')} /></div>
        </div>
        <div className="fld"><label>نوع الطلب</label>
          <div className="row">
            <button className={'btn sm ' + (f.urgency === 'standard' ? '' : 'ghost')} style={{ width: '100%' }} onClick={() => setF({ ...f, urgency: 'standard' })}>عادي</button>
            <button className={'btn sm ' + (f.urgency === 'priority' ? '' : 'ghost')} style={{ width: '100%' }} onClick={() => setF({ ...f, urgency: 'priority' })}>طوارئ</button>
          </div>
        </div>
        <button className="btn" onClick={submit}>انشر الطلب</button>
        <div className="err">{err}</div>
      </div>
    </>
  );
}

function Bids({ job, back }) {
  const [bids, setBids] = useState([]);
  const load = () => api(`/customer/jobs/${job.id}/bids`).then((r) => setBids(r.bids)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  async function accept(id) { try { await api(`/customer/jobs/${job.id}/accept`, 'POST', { bidId: id }); back(); } catch (e) { alert(e.data?.error || 'خطأ'); } }
  return (
    <>
      <div className="topbar"><button className="btn ghost sm" onClick={back}>رجوع</button><h1>العروض<div className="sub">{trAr(job.trade)} · {job.zone}</div></h1></div>
      <div className="wrap">
        {bids.length === 0 && <div className="empty">لسه مفيش عروض — استنى الصنايعية يقدّموا</div>}
        {bids.map((b) => (
          <div className="bidcard" key={b.id}>
            <div className="jt"><b>{b.name}</b><span className="muted">{b.ratingAvg ? <><Star size={12} strokeWidth={1.5} style={{ fill: 'currentColor', verticalAlign: '-1px' }} /> {b.ratingAvg.toFixed(1)}</> : 'جديد'} · {b.jobsCompleted} شغلانة</span></div>
            <div className="muted" style={{ marginBottom: 10 }}>السعر <span className="money" style={{ color: 'var(--accent)' }}>{egp(b.pricePst)}</span> ج · وصول خلال {b.etaMin} دقيقة</div>
            <button className="btn sm green" onClick={() => accept(b.id)}>اقبل العرض</button>
          </div>
        ))}
      </div>
    </>
  );
}

function Rate({ job, back }) {
  const [stars, setStars] = useState(0);
  async function submit() { if (!stars) return; try { await api(`/customer/jobs/${job.id}/rate`, 'POST', { stars }); back(); } catch (e) { alert(e.data?.error || 'خطأ'); } }
  return (
    <>
      <div className="topbar"><button className="btn ghost sm" onClick={back}>رجوع</button><h1>قيّم الفني</h1></div>
      <div className="wrap"><div className="card">
        <div className="muted" style={{ textAlign: 'center' }}>{trAr(job.trade)} — {job.zone}</div>
        <div className="stars">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={stars >= n ? 'on' : ''} onClick={() => setStars(n)}><Star size={26} strokeWidth={1.5} style={{ fill: stars >= n ? 'currentColor' : 'none' }} /></span>)}</div>
        <button className="btn gold" onClick={submit}>إرسال التقييم</button>
      </div></div>
    </>
  );
}
