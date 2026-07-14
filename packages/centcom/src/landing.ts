// One page to open every app, with the demo logins. Served at "/".
export function landingHtml(): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MiCasa — Demo Launchpad</title>
<style>
:root{--bg:#04070E;--panel:#0C1424;--line:rgba(120,160,255,.14);--accent:#4D9FFF;--gold:#D9B36A;--green:#3DD68C;--text:#EAF0FA;--muted:#7E92B4}
*{margin:0;padding:0;box-sizing:border-box}
body{background:radial-gradient(120% 90% at 50% 0%,#0C1830,var(--bg) 60%);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;padding:40px 18px}
.wrap{max-width:820px;margin:0 auto}
.logo{width:54px;height:54px;display:block;margin:0 auto 14px}
h1{text-align:center;font-size:30px;font-weight:800}h1 b{color:var(--accent)}
.sub{text-align:center;color:var(--muted);font-size:14px;margin:8px 0 34px}
.apps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-bottom:34px}
.app{display:block;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;text-decoration:none;color:inherit;transition:.15s}
.app:hover{border-color:var(--accent);transform:translateY(-3px)}
.app .ic{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:14px}
.app.c .ic{background:rgba(77,159,255,.12)}.app.w .ic{background:rgba(61,214,140,.12)}.app.a .ic{background:rgba(217,179,106,.12)}
.app b{font-size:17px;font-weight:700;display:block}
.app span{font-size:12.5px;color:var(--muted);display:block;margin-top:5px;line-height:1.5}
.app .go{margin-top:14px;font-size:13px;font-weight:700;color:var(--accent)}
h2{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:800;margin:0 4px 14px}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;font-size:13px}
th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);text-align:left;padding:11px 14px;border-bottom:1px solid var(--line)}
td{padding:11px 14px;border-bottom:1px solid rgba(120,160,255,.05)}
tr:last-child td{border-bottom:none}
code{font-family:'Consolas',monospace;background:rgba(120,160,255,.08);color:var(--gold);padding:2px 8px;border-radius:7px;font-size:12.5px}
.note{text-align:center;color:var(--muted);font-size:11.5px;margin-top:26px;line-height:1.7}
.role{font-size:9px;font-weight:800;letter-spacing:.5px;padding:3px 8px;border-radius:10px}
.role.a{background:rgba(217,179,106,.14);color:var(--gold)}.role.c{background:rgba(77,159,255,.13);color:var(--accent)}.role.w{background:rgba(61,214,140,.13);color:var(--green)}
</style></head><body><div class="wrap">
<svg class="logo" viewBox="0 0 200 200"><path d="M40 95 L100 42 L160 95" fill="none" stroke="#DDE9FF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path d="M55 92 L55 158 L145 158 L145 92" fill="none" stroke="#4D9FFF" stroke-width="14" stroke-linecap="round"/><path d="M78 158 L78 112 L100 134 L122 112 L122 158" fill="none" stroke="#D9B36A" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>
<h1>Mi<b>Casa</b> — Demo Launchpad</h1>
<div class="sub">Home-services bidding marketplace · open any app below and sign in with the test logins</div>
<div class="apps">
  <a class="app c" href="/customer/"><div class="ic">👤</div><b>Customer App</b><span>Post a job, view bids, accept, rate. (Arabic)</span><div class="go">Open →</div></a>
  <a class="app w" href="/workers/"><div class="ic">🔧</div><b>Workers App</b><span>Job feed, place bids, wallet & earnings. (Arabic)</span><div class="go">Open →</div></a>
  <a class="app a" href="/cic/"><div class="ic">🛡️</div><b>CIC — Admin</b><span>Dashboard, verification, wallets, config.</span><div class="go">Open →</div></a>
</div>
<h2>Test logins</h2>
<table>
<tr><th>Role</th><th>Open in</th><th>Username</th><th>Password</th><th>Notes</th></tr>
<tr><td><span class="role a">ADMIN</span></td><td>CIC</td><td><code>youssef_hq</code></td><td><code>LrOXxFPAf9CuHY29KTxx</code></td><td>Full control panel</td></tr>
<tr><td><span class="role c">CUSTOMER</span></td><td>Customer</td><td><code>mona</code></td><td><code>password123</code></td><td>Has existing jobs</td></tr>
<tr><td><span class="role c">CUSTOMER</span></td><td>Customer</td><td><code>khaled</code></td><td><code>password123</code></td><td>Has existing jobs</td></tr>
<tr><td><span class="role w">WORKER</span></td><td>Workers</td><td><code>ahmed</code></td><td><code>password123</code></td><td>Approved · funded · can bid now</td></tr>
<tr><td><span class="role w">WORKER</span></td><td>Workers</td><td><code>mahmoud</code></td><td><code>password123</code></td><td>Approved · postpaid grace</td></tr>
<tr><td><span class="role w">WORKER</span></td><td>Workers</td><td><code>saeed</code></td><td><code>password123</code></td><td>Pending — approve him in CIC</td></tr>
</table>
<div class="note">Try the full loop: as <b>mona</b> post a plumbing job in المعادي → as <b>ahmed</b> bid on it → back to mona, accept → ahmed marks done → mona confirms & rates → watch it live in CIC.<br>Demo data · you can reset anytime.</div>
</div></body></html>`;
}
