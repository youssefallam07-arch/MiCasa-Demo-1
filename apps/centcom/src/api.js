const BASE = import.meta.env.VITE_API_BASE || '/api';
let token = localStorage.getItem('vp_token') || null;
let user = JSON.parse(localStorage.getItem('vp_user') || 'null');

export function getUser() { return user; }
export function setSession(t, u) { token = t; user = u; localStorage.setItem('vp_token', t); localStorage.setItem('vp_user', JSON.stringify(u)); }
export function clearSession() { token = null; user = null; localStorage.removeItem('vp_token'); localStorage.removeItem('vp_user'); }

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

// Authenticated binary download (keeps the JWT in the header, never in the URL).
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
