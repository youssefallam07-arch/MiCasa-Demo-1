const BASE = import.meta.env.VITE_API_BASE || '/api';

// --- Impersonation ("Open as") support ---
// CENTCOM opens this app in a new tab with #imp=<json>. Because every app is
// served from the same origin, localStorage is shared — so an impersonated
// session is kept in per-tab sessionStorage (and read first) to avoid clobbering
// the admin's own login in the CENTCOM tab.
(function captureImpersonation() {
  try {
    const h = new URLSearchParams(location.hash.slice(1));
    const raw = h.get('imp');
    if (raw) {
      sessionStorage.setItem('vp_imp', decodeURIComponent(raw));
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch { /* ignore malformed hash */ }
})();
const _imp = (() => { try { return JSON.parse(sessionStorage.getItem('vp_imp') || 'null'); } catch { return null; } })();

let token = (_imp && _imp.token) || localStorage.getItem('vp_token') || null;
let user = (_imp && _imp.user) || JSON.parse(localStorage.getItem('vp_user') || 'null');

export function isImpersonating() { return !!_imp; }
export function getUser() { return user; }
export function setSession(t, u) {
  token = t; user = u;
  if (_imp) { sessionStorage.setItem('vp_imp', JSON.stringify({ token: t, user: u })); return; }
  localStorage.setItem('vp_token', t); localStorage.setItem('vp_user', JSON.stringify(u));
}
export function clearSession() {
  token = null; user = null;
  sessionStorage.removeItem('vp_imp');
  if (!_imp) { localStorage.removeItem('vp_token'); localStorage.removeItem('vp_user'); }
}

export async function api(path, method = 'GET', body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'error'), { status: r.status, data });
  return data;
}

export const egp = (pst) => (pst / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const toPst = (e) => Math.round(Number(e) * 100);

// Authenticated binary download (keeps the JWT in the header).
export async function download(path, fallbackName = 'download') {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { headers });
  if (!r.ok) throw Object.assign(new Error('download_failed'), { status: r.status });
  const blob = await r.blob();
  const cd = r.headers.get('Content-Disposition') || '';
  const name = (cd.match(/filename="([^"]+)"/) || [])[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

// Thin banner so it's always obvious this tab is an admin impersonation.
if (_imp && _imp.user) {
  const bar = document.createElement('div');
  bar.dir = 'ltr';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#D9B36A;color:#04070E;font:600 13px system-ui,sans-serif;padding:7px 14px;display:flex;justify-content:center;gap:14px;align-items:center;box-shadow:0 1px 6px rgba(0,0,0,.3)';
  bar.innerHTML = '<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg> Viewing as <b>' + _imp.user.name + '</b> (admin impersonation)</span>';
  const exit = document.createElement('a');
  exit.textContent = 'Exit';
  exit.style.cssText = 'color:#04070E;text-decoration:underline;cursor:pointer';
  exit.onclick = () => { sessionStorage.removeItem('vp_imp'); window.close(); location.reload(); };
  bar.appendChild(exit);
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
  if (document.body) document.body.appendChild(bar);
}
