// P0 security checks — run with the centcom server up on :4000.
//   node scripts/check-p0.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://localhost:4000';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
};
const req = (p, { method = 'GET', token, ip, body } = {}) =>
  fetch(API + p, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

console.log('P0 security checks');

// ---- 1. boot with a weak JWT_SECRET must fail ----
await new Promise((resolve) => {
  const p = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'packages/centcom/src/server.ts'], {
    cwd: root,
    env: { ...process.env, JWT_SECRET: 'dev-secret', CENTCOM_PORT: '4999' },
  });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  const t = setTimeout(() => { p.kill(); ok('boot rejects weak JWT_SECRET', false, 'server did not exit within 10s'); resolve(); }, 10000);
  p.on('exit', (code) => { clearTimeout(t); ok('boot rejects weak JWT_SECRET', code !== 0 && /JWT_SECRET/.test(err), 'exit=' + code); resolve(); });
});

// ---- 2. token forged with the old default secret is rejected on admin routes ----
{
  const forged = jwt.sign({ sub: 'x', role: 'admin', name: 'attacker' }, 'dev-secret', { expiresIn: '1h' });
  const r = await req('/api/admin/registry', { token: forged });
  ok('forged dev-secret token -> 401 on /api/admin/*', r.status === 401, 'status=' + r.status);
}

// ---- 3. control: real admin login still works ----
{
  const firstLogin = fs.readFileSync(path.join(root, 'docs/FIRST_LOGIN.md'), 'utf8');
  const pw = firstLogin.match(/Password: `([^`]+)`/)[1];
  const r = await req('/api/auth/login', { method: 'POST', body: { username: 'youssef_hq', password: pw } });
  const j = await r.json();
  ok('real admin login still works', r.status === 200 && j.token, 'status=' + r.status);
  if (j.token) {
    const r2 = await req('/api/admin/overview', { token: j.token });
    ok('real admin token -> 200 on /api/admin/*', r2.status === 200, 'status=' + r2.status);
  }
}

// ---- 4. per-IP rate limit: 6th failed login in window -> 429 ----
{
  const statuses = [];
  for (let i = 1; i <= 6; i++) {
    const r = await req('/api/auth/login', { method: 'POST', ip: '10.9.9.9', body: { username: 'mona', password: 'wrong-' + i } });
    statuses.push(r.status);
  }
  ok('5 failed logins pass as 401, 6th -> 429', statuses.slice(0, 5).every((s) => s === 401) && statuses[5] === 429, statuses.join(','));
}

// ---- 5. per-username lockout: 10 fails (distributed IPs) -> account locked ----
{
  for (let i = 1; i <= 10; i++) {
    await req('/api/auth/login', { method: 'POST', ip: '10.8.8.' + i, body: { username: 'khaled', password: 'wrong' } });
  }
  const r = await req('/api/auth/login', { method: 'POST', ip: '10.8.8.99', body: { username: 'khaled', password: 'password123' } });
  const j = await r.json().catch(() => ({}));
  ok('10 distributed fails lock the account (even with right password)', r.status === 429 && j.error === 'account_locked', 'status=' + r.status + ' err=' + j.error);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
