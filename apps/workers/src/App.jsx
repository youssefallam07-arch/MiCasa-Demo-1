import React, { useEffect, useState } from 'react';
import { api, egp, toPst, getUser, setSession, clearSession } from './api.js';

const TRADES = [['plumbing', 'سباكة'], ['electrical', 'كهرباء'], ['ac', 'تكييف'], ['carpentry', 'نجارة'], ['painting', 'دهانات'], ['appliance', 'أجهزة'], ['handyman', 'صنايعي']];
const ZONES = ['المعادي', 'مدينة نصر', 'الزمالك', 'مصر الجديدة'];
const trAr = (t) => (TRADES.find((x) => x[0] === t) || [t, t])[1];
const BLOCK_AR = { suspended: 'حسابك موقوف', not_verified: 'حسابك تحت المراجعة', insufficient: 'رصيدك مش مكفي للعمولة — اشحن الأول', debt_unsettled: 'سدّد مستحقاتك الأول', no_profile: '—' };
const LEDGER_AR = { topup: 'شحن رصيد', hold: 'حجز عمولة', capture: 'خصم عمولة', release: 'استرجاع', adjustment: 'تسوية', refund: 'رد رصيد' };

const Logo = () => (<svg className="logo" viewBox="0 0 200 200"><path d="M40 95 L100 42 L160 95" fill="none" stroke="#DDE9FF" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /><path d="M55 92 L55 158 L145 158 L145 92" fill="none" stroke="#4D9FFF" strokeWidth="14" strokeLinecap="round" /><path d="M78 158 L78 112 L100 134 L122 112 L122 158" fill="none" stroke="#D9B36A" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /></svg>);

export default function App() {
  const [user, setUser] = useState(getUser());
  if (!user) return <Auth onIn={setUser} />;
  return <Main user={user} onOut={() => { clearSession(); setUser(null); }} />;
}

function Auth({ onIn }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ username: '', password: '', name: '', phone: '', trade: 'plumbing', zone: 'المعادي' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function go() {
    setErr('');
    try {
      const r = mode === 'register'
        ? await api('/auth/register', 'POST', { role: 'worker', username: f.username, password: f.password, name: f.name, phone: f.phone, trade: f.trade, zone: f.zone })
        : await api('/auth/login', 'POST', { username: f.username, password: f.password });
      setSession(r.token, r.user); onIn(r.user);
    } catch (e) { setErr(e.data?.error === 'invalid_credentials' ? 'بيانات الدخول غلط' : e.data?.error === 'username_taken' ? 'الاسم موجود' : 'حصل خطأ'); }
  }
  return (
    <div className="authwrap">
      <Logo /><h1>Mi<b>Casa</b> صنايعي</h1><p>استقبل شغل وقدّم عروضك</p>
      <div className="tabs"><button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>دخول</button><button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>حساب جديد</button></div>
      {mode === 'register' && <>
        <div className="fld"><label>الاسم</label><input value={f.name} onChange={set('name')} /></div>
        <div className="fld"><label>رقم الموبايل</label><input value={f.phone} onChange={set('phone')} /></div>
        <div className="row"><div className="fld"><label>الصنعة</label><select value={f.trade} onChange={set('trade')}>{TRADES.map(([v, a]) => <option key={v} value={v}>{a}</option>)}</select></div><div className="fld"><label>المنطقة</label><select value={f.zone} onChange={set('zone')}>{ZONES.map((z) => <option key={z} value={z}>{z}</option>)}</select></div></div>
      </>}
      <div className="fld"><label>اسم المستخدم</label><input value={f.username} onChange={set('username')} /></div>
      <div className="fld"><label>كلمة المرور</label><input type="password" value={f.password} onChange={set('password')} /></div>
      <button className="btn" onClick={go}>{mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
      {mode === 'register' && <p style={{ marginTop: 12 }}>حسابك هيتراجع من الإدارة قبل ما تشتغل</p>}
      <div className="err">{err}</div>
    </div>
  );
}

function Main({ user, onOut }) {
  const [tab, setTab] = useState('feed');
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const loadCommon = () => { api('/worker/me').then((r) => setProfile(r.profile)).catch(() => {}); api('/worker/wallet').then(setWallet).catch(() => {}); };
  useEffect(() => { loadCommon(); const t = setInterval(loadCommon, 5000); return () => clearInterval(t); }, []);
  const avail = wallet ? egp(wallet.availablePst) : '0';
  return (
    <>
      <div className="topbar"><Logo /><h1>{user.name}<div className="sub">{profile ? (profile.verificationStatus === 'approved' ? (profile.walletMode === 'prepaid' ? 'رصيد مسبق' : 'فترة سماح') : 'تحت المراجعة') : '…'} · رصيد <span className="num">{avail}</span> ج</div></h1><button className="btn ghost sm" onClick={onOut}>خروج</button></div>
      <div className="wrap">
        {tab === 'feed' && <Feed profile={profile} />}
        {tab === 'jobs' && <MyJobs />}
        {tab === 'wallet' && <Wallet wallet={wallet} reload={loadCommon} />}
        {tab === 'profile' && <Profile profile={profile} />}
      </div>
      <div className="nav">
        <button className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>🔧<span>شغل</span></button>
        <button className={tab === 'jobs' ? 'on' : ''} onClick={() => setTab('jobs')}>📋<span>شغلي</span></button>
        <button className={tab === 'wallet' ? 'on' : ''} onClick={() => setTab('wallet')}>👛<span>المحفظة</span></button>
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>👤<span>حسابي</span></button>
      </div>
    </>
  );
}

function Feed({ profile }) {
  const [jobs, setJobs] = useState([]);
  const [bidFor, setBidFor] = useState(null);
  const load = () => api('/worker/feed').then((r) => setJobs(r.jobs)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  if (profile && profile.verificationStatus !== 'approved')
    return <div className="card"><div className="jt"><b>حسابك تحت المراجعة ⏳</b></div><div className="muted">لازم الإدارة توافق على حسابك قبل ما تستقبل شغل. راجع الإدارة أو استنى التفعيل.</div></div>;
  if (bidFor) return <BidSheet job={bidFor} close={() => { setBidFor(null); load(); }} />;
  return (
    <>
      <div className="sec">طلبات في منطقتك — {profile?.zone} · {trAr(profile?.trade || '')}</div>
      {jobs.length === 0 && <div className="empty">مفيش طلبات دلوقتي — استنى شوية</div>}
      {jobs.map((j) => (
        <div className="card" key={j.id}>
          <div className="jt"><b>{trAr(j.trade)}</b>{j.urgency === 'priority' && <span className="pill priority">طوارئ</span>}<span className="money" style={{ color: 'var(--accent)' }}>{egp(j.budgetOfferPst)} ج</span></div>
          <div className="muted" style={{ marginBottom: 8 }}>{j.description}</div>
          <div className="muted">عمولة المنصة لو اتقبلت: <span className="num">{egp(j.commissionPst)}</span> ج · {j.bidCount} عرض</div>
          <div style={{ marginTop: 12 }}>
            {j.myBid ? <button className="btn sm ghost" disabled>عرضك: {egp(j.myBid.pricePst)} ج · {j.myBid.etaMin} د ✓</button>
              : j.canBid ? <button className="btn sm" onClick={() => setBidFor(j)}>قدّم عرضك</button>
                : <div className="muted" style={{ color: 'var(--amber)' }}>{BLOCK_AR[j.blockReason] || 'مش متاح'}</div>}
          </div>
        </div>
      ))}
    </>
  );
}

function BidSheet({ job, close }) {
  const [price, setPrice] = useState(egp(job.budgetOfferPst));
  const [eta, setEta] = useState('30');
  const [err, setErr] = useState('');
  async function submit() {
    setErr('');
    try { await api('/worker/bids', 'POST', { jobId: job.id, pricePst: toPst(price), etaMin: Number(eta) }); close(); }
    catch (e) { setErr(BLOCK_AR[e.data?.error?.replace('coverage_', '')] || 'تعذّر إرسال العرض'); }
  }
  return (
    <>
      <div className="sec">قدّم عرضك — {trAr(job.trade)}</div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 10 }}>العميل عارض <span className="num">{egp(job.budgetOfferPst)}</span> ج</div>
        <div className="row">
          <div className="fld"><label>سعرك (ج)</label><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="fld"><label>وصول (دقيقة)</label><input type="number" value={eta} onChange={(e) => setEta(e.target.value)} /></div>
        </div>
        <div className="muted" style={{ marginBottom: 12 }}>لو العميل قبل، هيتحجز <span className="num">{egp(job.commissionPst)}</span> ج عمولة من رصيدك.</div>
        <button className="btn" onClick={submit}>ابعت العرض</button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={close}>رجوع</button>
        <div className="err">{err}</div>
      </div>
    </>
  );
}

function MyJobs() {
  const [jobs, setJobs] = useState([]);
  const load = () => api('/worker/jobs').then((r) => setJobs(r.jobs)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  async function act(fn) { try { await fn(); } catch (e) { alert(e.data?.error || 'خطأ'); } load(); }
  return (
    <>
      <div className="sec">شغلي الحالي</div>
      {jobs.length === 0 && <div className="empty">مفيش شغل متقبل دلوقتي</div>}
      {jobs.map((j) => (
        <div className="card" key={j.id}>
          <div className="jt"><b>{trAr(j.trade)}</b><span className={'pill ' + j.status}>{j.status === 'accepted' ? 'شغال' : j.status === 'worker_done' ? 'مستني تأكيد العميل' : 'طلب إلغاء'}</span></div>
          <div className="muted" style={{ marginBottom: 10 }}>{j.description} · المتفق عليه <span className="num">{egp(j.commissionPst ? j.budgetOfferPst : j.budgetOfferPst)}</span> ج</div>
          {j.status === 'accepted' && <div className="row">
            <button className="btn sm green" onClick={() => act(() => api(`/worker/jobs/${j.id}/complete`, 'POST'))}>خلصت الشغلانة</button>
            <button className="btn sm ghost" onClick={() => act(() => api(`/worker/jobs/${j.id}/cancel`, 'POST', { contacted: false }))}>إلغاء</button>
          </div>}
          {j.status === 'worker_done' && <div className="muted">مستني العميل يأكّد الإنهاء…</div>}
          {j.status === 'cancel_pending' && <div className="muted" style={{ color: 'var(--red)' }}>الإلغاء بيتراجع من الإدارة/العميل — العمولة لسه محجوزة</div>}
        </div>
      ))}
    </>
  );
}

function Wallet({ wallet, reload }) {
  const [busy, setBusy] = useState(false);
  if (!wallet) return <div className="empty">تحميل…</div>;
  async function topup() {
    setBusy(true);
    try { const r = await api('/worker/wallet/topup', 'POST', { amountPst: 20000, method: 'vodafone_cash' }); alert('تم إرسال طلب شحن 200 ج — بانتظار تأكيد الإدارة. رقم: ' + r.ref); }
    catch (e) { alert(e.data?.error === 'below_minimum' ? 'أقل من الحد الأدنى' : 'خطأ'); }
    setBusy(false); reload();
  }
  return (
    <>
      <div className="sec">رصيد الخدمة المدفوع مقدماً</div>
      <div className="card" style={{ background: 'linear-gradient(140deg,#12203C,#0A1428)' }}>
        <div className="muted">الرصيد المتاح</div>
        <div style={{ fontSize: 34, fontWeight: 700 }} className="num">{egp(wallet.availablePst)} <span style={{ fontSize: 15, color: 'var(--muted)' }}>ج</span></div>
        <div className="row" style={{ marginTop: 12 }}>
          <div><div className="muted">محجوز عمولة</div><div className="num" style={{ color: 'var(--amber)', fontWeight: 700 }}>{egp(wallet.heldPst)}</div></div>
          {wallet.debtPst > 0 && <div><div className="muted">مستحق عليك</div><div className="num" style={{ color: 'var(--red)', fontWeight: 700 }}>{egp(wallet.debtPst)}</div></div>}
        </div>
        <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={topup}>اشحن 200 ج</button>
      </div>
      <div className="muted" style={{ textAlign: 'center', margin: '4px 0 14px', fontSize: 10 }}>رصيد لخصم عمولة المنصة فقط · غير قابل للسحب</div>
      <div className="sec">سجل المعاملات</div>
      {(wallet.txns || []).length === 0 && <div className="empty">مفيش معاملات</div>}
      {(wallet.txns || []).map((t) => (
        <div className="card" key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
          <div style={{ flex: 1 }}><b style={{ fontSize: 13 }}>{LEDGER_AR[t.type] || t.type}</b><div className="muted">{new Date(t.createdAt).toLocaleDateString('ar-EG')}</div></div>
          <div className="num" style={{ fontWeight: 800, color: t.type === 'topup' || t.type === 'release' ? 'var(--green)' : t.type === 'hold' ? 'var(--amber)' : 'var(--red)' }}>{t.type === 'topup' || t.type === 'release' ? '+' : t.type === 'hold' ? '' : '−'}{egp(Math.abs(t.amountPst))} ج</div>
        </div>
      ))}
    </>
  );
}

function Profile({ profile }) {
  if (!profile) return <div className="empty">تحميل…</div>;
  const V = { pending: 'تحت المراجعة', interviewed: 'تم الإنترفيو', trial: 'شغلانة تجريبية', approved: 'معتمد ✅', rejected: 'مرفوض' };
  return (
    <>
      <div className="sec">حسابي</div>
      <div className="card">
        <div className="jt"><b>{trAr(profile.trade)}</b><span className={'pill ' + (profile.verificationStatus === 'approved' ? 'completed' : 'accepted')}>{V[profile.verificationStatus]}</span></div>
        <div className="muted">المنطقة: {profile.zone}</div>
        <div className="muted">التقييم: {profile.ratingCount ? '★ ' + (profile.ratingSum / profile.ratingCount).toFixed(1) : 'جديد'} · شغلانات: {profile.jobsCompleted}</div>
        <div className="muted">النظام: {profile.walletMode === 'prepaid' ? 'رصيد مسبق' : 'فترة سماح'} · إنذارات: {profile.strikes}</div>
      </div>
      <div className="card"><div className="jt"><b>🔒 رصيد الخدمة</b></div><div className="muted">العمولة بتتحجز من رصيدك لما العميل يقبل عرضك، وتتخصم لما تخلّص الشغلانة. من غير رصيد كافي مش هتقدر تقدم عروض.</div></div>
    </>
  );
}
