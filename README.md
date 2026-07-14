# MiCasa — Home-Services Bidding Marketplace

A two-sided marketplace where customers post home-service jobs, vetted workers
(*sanaey3eya*) bid on them (price + ETA), and the platform earns commission through a
prepaid service-credit wallet. Built as a clean **Mainframe → Centcom → Apps** monorepo.

> **Status:** working end-to-end locally (full happy path + cancellation path verified).
> Payment gateway, SMS, and photo upload are stubbed (see [Roadmap](#roadmap)).

---

## 🚀 Live demo

The demo is served from a dev machine over a temporary Cloudflare tunnel, so the public URL
changes on every restart and is **not pinned here** — run `./start-online.ps1` to build,
serve, and print a fresh link (it opens a landing page with every app). Ping Youssef for the
current link; a permanent always-on deployment is on the [Roadmap](#roadmap).

Admin credentials are generated randomly by the seed and written **only** to the gitignored
`docs/FIRST_LOGIN.md` — they are never committed or published.

---

## What's inside

| Surface | Folder | What it does |
|---|---|---|
| 👤 **Customer app** | `apps/customer` | Post a job, view bids, accept, confirm completion, rate. React PWA, Arabic RTL. |
| 🔧 **Workers app** | `apps/workers` | Job feed (trade + zone), place bids, wallet & earnings, profile. React PWA, Arabic RTL, driver-style. |
| 🛡️ **CIC (admin)** | `apps/cic` | *Control & Information Center* — dashboard, worker verification, wallets, top-up & release queues, config. |
| 🌐 **Centcom** | `packages/centcom` | The **only** API gateway. Express + JWT, role-scoped routes, serves the built apps. |
| 🧠 **Mainframe** | `packages/mainframe` | The core: Prisma/SQLite schema, all business logic, money, admin-editable config, seed. |

## Architecture

```
                 ┌─────────────┐
                 │  MAINFRAME  │  DB (Prisma) + business logic + money  (packages/mainframe)
                 └──────┬──────┘
                        │  imported ONLY by Centcom
                 ┌──────┴──────┐
                 │   CENTCOM   │  REST API + JWT auth — single gateway   (packages/centcom)
                 └──┬────┬────┬─┘
        /api/worker │    │    │ /api/customer      /api/admin
        ┌───────────┘    │    └───────────┐
┌───────┴──────┐ ┌───────┴──────┐ ┌───────┴──────┐
│ WORKERS APP  │ │ CUSTOMER APP │ │     CIC      │  React PWAs / admin  (apps/*)
└──────────────┘ └──────────────┘ └──────────────┘
```

**Apps never touch the database** — they call Centcom over HTTP; Centcom is the only
thing that imports the Mainframe. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full write-up.

## How the money works (the interesting part)

- Customers always pay workers **in cash** — the platform never touches job payments.
- Instead, workers hold **prepaid service credit**. When a customer accepts a bid, the
  commission (**12%** standard / **17%** priority, admin-editable) is **held** from the
  worker's credit; on completion it's **captured** as platform revenue; on a confirmed
  cancellation it's **released** back.
- New workers get a **postpaid grace period** (commission accrues as debt for their first
  N jobs, then they switch to prepaid).
- All money is stored as **integer piasters** (no floats), and hold/capture/release run
  as **guarded atomic DB updates** — the wallet can never overdraw and a job can't be
  double-accepted, even under concurrent requests.

## Tech stack

React + Vite · Node/Express · Prisma + SQLite (portable to Postgres/Supabase) · JWT auth ·
Zod validation · npm workspaces monorepo.

## Quick start

Requires **Node 18+**.

```bash
npm install          # install the whole workspace
npm run db:setup     # generate Prisma client + create the SQLite db
npm run seed         # seed admin + demo workers/customers/jobs (prints the admin password)
npm run dev          # start Centcom (:4000) + all three apps (:5173 / :5174 / :5175)
```

Or run the **one-link demo** (builds the apps and serves everything from Centcom on one port):

```bash
npm run build:apps
npm run serve        # open http://localhost:4000  → landing page with all apps + logins
```

## Demo logins (from the seed)

| Role | Username | Password |
|---|---|---|
| Admin (CIC) | `youssef_hq` | *printed by the seed → `docs/FIRST_LOGIN.md`* |
| Customer | `mona`, `khaled` | `password123` |
| Worker | `ahmed` (approved, funded), `mahmoud` (postpaid), `saeed` (pending) | `password123` |

**Try the loop:** as `mona` post a plumbing job in المعادي → as `ahmed` bid on it →
back to `mona`, accept → `ahmed` marks done → `mona` confirms & rates → watch it live in CIC.

## Roadmap

- [ ] Payment gateway (Vodafone Cash / InstaPay) — currently a manual admin-confirmed top-up
- [ ] SMS / phone verification — currently username + password
- [ ] Job photo upload & storage — schema + placeholder exist
- [ ] Migrate DB from SQLite → Postgres/Supabase for always-on hosting
- [ ] Live production deployment

---

*Private repo. Secrets (`.env`, database, admin credentials) are gitignored and never committed.*
