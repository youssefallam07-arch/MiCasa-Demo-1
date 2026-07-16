// One page to open every app, with the demo logins. Served at "/".
export function landingHtml(): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MiCasa — Demo Launchpad</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>
:root{--bg:#F1EDE3;--panel:#FCFAF5;--line:#DFD7C6;--accent:#0B6E63;--gold:#B58324;--green:#1E9E5A;--text:#171A19;--muted:#5C615E}
*{margin:0;padding:0;box-sizing:border-box}
body{background:radial-gradient(120% 90% at 50% 0%,#EAF1EF,var(--bg) 60%);color:var(--text);font-family:'IBM Plex Sans Arabic','Tajawal',system-ui,sans-serif;min-height:100vh;padding:40px 18px}
.wrap{max-width:820px;margin:0 auto}
.logo{width:54px;height:54px;display:block;margin:0 auto 14px}
h1{text-align:center;font-size:30px;font-weight:800}h1 b{color:var(--accent)}
.sub{text-align:center;color:var(--muted);font-size:14px;margin:8px 0 34px}
.apps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-bottom:34px}
.app{display:block;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;text-decoration:none;color:inherit;transition:.15s;box-shadow:0 1px 2px rgba(20,25,24,.06),0 1px 1px rgba(20,25,24,.04)}
.app:hover{border-color:var(--accent);transform:translateY(-3px);box-shadow:0 12px 32px rgba(20,25,24,.12)}
.app .ic{width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.app .ic svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.app.c .ic{background:rgba(11,110,99,.12);color:var(--accent)}.app.w .ic{background:rgba(30,158,90,.12);color:var(--green)}.app.a .ic{background:rgba(181,131,36,.12);color:var(--gold)}
.app b{font-size:17px;font-weight:700;display:block}
.app span{font-size:12.5px;color:var(--muted);display:block;margin-top:5px;line-height:1.5}
.app .go{margin-top:14px;font-size:13px;font-weight:700;color:var(--accent)}
h2{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:800;margin:0 4px 14px}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;font-size:13px}
th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);text-align:left;padding:11px 14px;border-bottom:1px solid var(--line)}
td{padding:11px 14px;border-bottom:1px solid rgba(20,25,24,.05)}
tr:last-child td{border-bottom:none}
code{font-family:'Consolas',monospace;background:rgba(20,25,24,.08);color:var(--gold);padding:2px 8px;border-radius:7px;font-size:12.5px}
.note{text-align:center;color:var(--muted);font-size:11.5px;margin-top:26px;line-height:1.7}
.role{font-size:9px;font-weight:800;letter-spacing:.5px;padding:3px 8px;border-radius:10px}
.role.a{background:rgba(181,131,36,.14);color:var(--gold)}.role.c{background:rgba(11,110,99,.13);color:var(--accent)}.role.w{background:rgba(30,158,90,.13);color:var(--green)}
</style></head><body><div class="wrap">
<svg class="logo" viewBox="0 0 200 200"><path d="M40 95 L100 42 L160 95" fill="none" stroke="#171A19" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path d="M55 92 L55 158 L145 158 L145 92" fill="none" stroke="#0B6E63" stroke-width="14" stroke-linecap="round"/><path d="M78 158 L78 112 L100 134 L122 112 L122 158" fill="none" stroke="#B58324" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>
<h1>Mi<b>Casa</b> — Demo Launchpad</h1>
<div class="sub">Home-services bidding marketplace · open any app below and sign in with the test logins</div>
<div class="apps">
  <a class="app c" href="/customer/"><div class="ic"><svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><b>Customer App</b><span>Post a job, view bids, accept, rate. (Arabic)</span><div class="go">Open →</div></a>
  <a class="app w" href="/workers/"><div class="ic"><svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div><b>Workers App</b><span>Job feed, place bids, wallet & earnings. (Arabic)</span><div class="go">Open →</div></a>
  <a class="app a" href="/cic/"><div class="ic"><svg viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg></div><b>CIC — Admin ops</b><span>Dashboard, verification, wallets, config.</span><div class="go">Open →</div></a>
  <a class="app a" href="/centcom/"><div class="ic"><svg viewBox="0 0 24 24"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg></div><b>CENTCOM — Owner</b><span>Master terminal · every account, full control.</span><div class="go">Open →</div></a>
</div>
<h2>Test logins</h2>
<table>
<tr><th>Role</th><th>Open in</th><th>Username</th><th>Password</th><th>Notes</th></tr>
<tr><td><span class="role c">CUSTOMER</span></td><td>Customer</td><td><code>mona</code></td><td><code>password123</code></td><td>Has existing jobs</td></tr>
<tr><td><span class="role c">CUSTOMER</span></td><td>Customer</td><td><code>khaled</code></td><td><code>password123</code></td><td>Has existing jobs</td></tr>
<tr><td><span class="role w">WORKER</span></td><td>Workers</td><td><code>ahmed</code></td><td><code>password123</code></td><td>Approved · funded · can bid now</td></tr>
<tr><td><span class="role w">WORKER</span></td><td>Workers</td><td><code>mahmoud</code></td><td><code>password123</code></td><td>Approved · funded · can bid now</td></tr>
<tr><td><span class="role w">WORKER</span></td><td>Workers</td><td><code>saeed</code></td><td><code>password123</code></td><td>Pending — approve him in CIC</td></tr>
</table>
<div class="note">Admin (CIC / CENTCOM) credentials are not published — they live in <b>docs/FIRST_LOGIN.md</b> on the host machine (gitignored).<br>Try the full loop: as <b>mona</b> post a plumbing job in المعادي → as <b>ahmed</b> bid on it → back to mona, accept → ahmed marks done → mona confirms & rates → watch it live in CIC.<br>Demo data · you can reset anytime.</div>
</div></body></html>`;
}
