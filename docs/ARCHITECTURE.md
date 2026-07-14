# Venture Platform — Architecture

Home-services bidding marketplace, built as an npm-workspaces monorepo following a
**Mainframe → Centcom → Apps** layering. Apps never touch the database; they speak
only to Centcom over HTTP, and Centcom is the only thing that imports the Mainframe.

```
                      ┌─────────────┐
                      │  MAINFRAME  │  packages/mainframe  — DB (Prisma/SQLite), business logic, money
                      └──────┬──────┘
                             │  (imported ONLY by Centcom)
                      ┌──────┴──────┐
                      │   CENTCOM   │  packages/centcom    — REST API + JWT auth (the single gateway)
                      └───┬────┬────┬┘
              HTTP /worker │    │    │ /customer            /admin
        ┌─────────────────┘    │    └─────────────────┐
┌───────┴────────┐  ┌──────────┴─────┐  ┌─────────────┴──────┐
│  WORKERS APP   │  │  CUSTOMER APP  │  │        CIC          │
│ apps/workers   │  │ apps/customer  │  │     apps/cic        │
│ React PWA, RTL │  │ React PWA, RTL │  │ React admin (LTR)   │
│ :5174          │  │ :5173          │  │ :5175               │
└────────────────┘  └────────────────┘  └────────────────────┘
```

## Ports
| Service        | Port  | URL                     |
|----------------|-------|-------------------------|
| Centcom (API)  | 4000  | http://localhost:4000   |
| Customer app   | 5173  | http://localhost:5173   |
| Workers app    | 5174  | http://localhost:5174   |
| CIC admin      | 5175  | http://localhost:5175   |

## Run it
This machine has no system Node, so a **portable Node** is bootstrapped into `.tools/`
(gitignored). With Node on PATH:

```
npm install          # once — installs the whole workspace
npm run db:setup     # prisma generate + create SQLite db
npm run seed         # seed admin + fake workers/customers/jobs (prints admin password)
npm run dev          # starts Centcom + all three apps concurrently
```

Admin credentials are printed by the seed and written to `docs/FIRST_LOGIN.md`
(gitignored). Test accounts use password `password123`.

## Layer responsibilities

### Mainframe (`packages/mainframe`) — the core
- **`prisma/schema.prisma`** — Users, WorkerProfile, Job, Bid, Rating, ServiceCreditAccount,
  ServiceCreditTxn (immutable ledger), TopupRequest, AdminConfig.
- **`src/config.ts`** — every business rule reads from `AdminConfig` (commission rates,
  min top-up, postpaid limit, cancel threshold, max strikes). **Nothing hardcoded.**
- **`src/money.ts`** — all money is **integer piasters** (1 EGP = 100).
- **`src/credit.ts`** — commission maths, coverage/bidding-gate check, top-up request +
  admin-confirmed settlement (debt settled first).
- **`src/marketplace.ts`** — the state machine: post job → bid → **accept (commission HOLD)** →
  worker marks done → **customer confirms (CAPTURE)**; worker cancel → **pending release** →
  customer/admin **RELEASE**. Uses guarded atomic updates (`updateMany` with a balance/status
  guard inside a transaction) so the wallet can never overdraw and a job can't be double-accepted.
- **`src/admin.ts`** — CIC read models + verification/suspension/config actions.

### Centcom (`packages/centcom`) — the only gateway
- Express + JWT. `authenticate` attaches `req.user`; `requireRole('worker'|'customer'|'admin')`
  gates each route tree. Consistent error shape via `helpers.errorHandler` (AppError → `{error:code}`).
- Route trees: `/auth`, `/customer/*`, `/worker/*`, `/admin/*`. Zod validates every body.
- Imports the Mainframe by relative path (`src/core.ts`) — the single seam.

### Apps
- **Customer** (RTL Arabic): register/login → post job → my jobs → view bids → accept →
  confirm completion → rate.
- **Workers** (RTL Arabic, driver-style): login → job feed (trade+zone filtered, with the
  service-credit coverage gate) → bid → my jobs (complete / cancel) → wallet (balance, held,
  ledger, top-up) → profile (verification + strikes).
- **CIC** (LTR, desktop, information-dense): admin-only login → dashboard (jobs, bids/job,
  completion rate, commission captured) → verification queue → jobs table → wallets overview →
  manual top-up queue → pending release queue → config editor → change password.

## Money & concurrency
- Integer piasters everywhere; convert to EGP only at the UI edge (`api.js` helpers).
- Commission hold/capture/release run inside Prisma transactions with **guarded conditional
  updates** — the balance decrement only applies while the balance still covers it, so two
  concurrent acceptances against a balance that covers one → exactly one succeeds, no overdraw.

## Stubs / TODO (not wired to real services yet)
- **Payments** (Vodafone Cash / InstaPay): top-up is a manual request → **admin confirms
  received transfer** in CIC. Real payment-gateway integration is a TODO.
- **SMS / phone verification**: not implemented — accounts are username/password only for now.
- **Photos**: job `photos` is stored as a JSON array of strings; the customer app has a
  placeholder, no real upload/storage yet.
- **Database**: SQLite for zero-config local dev. Schema is written to port to Postgres/Supabase
  by changing the datasource `provider` + `DATABASE_URL` (no SQLite-only features used).

## Repo hygiene
- `.env` (real) is gitignored from the first commit; `.env.example` is the template.
- `.tools/` (portable Node) and `node_modules/` are gitignored.
- `docs/FIRST_LOGIN.md` (admin credentials) is gitignored.
