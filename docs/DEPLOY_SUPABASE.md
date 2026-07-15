# Persistent data with Supabase (Postgres)

By default MiCasa runs on a local SQLite file. That's zero-config and perfect for
development, but on the free Render tier the container's filesystem is **ephemeral** —
every restart/redeploy resets the database to the seed.

Point it at a free **Supabase** Postgres database and the data becomes permanent:
accounts, jobs, bids, wallets, the audit log, and the Brain's history all survive
restarts, and the live site and your PC can share the exact same data.

**No code changes are needed.** The stack auto-switches from SQLite to Postgres the
moment `DATABASE_URL` is a Postgres connection string (see
`packages/mainframe/scripts/prisma.mjs`). You only set one environment variable.

> **You do these steps** — creating the account and setting the secret. I can't create
> a Supabase account for you or handle your connection string; it's a credential that
> belongs only in your Supabase and Render dashboards.

---

## 1. Create a free Supabase project

1. Go to **https://supabase.com** → sign in → **New project**.
2. Pick a name, a strong **database password** (save it), and a region near Egypt
   (e.g. `Central EU (Frankfurt)`).
3. Wait ~2 minutes for it to provision.

## 2. Copy the connection string

In the project: **Connect** (top bar) → **ORMs** / **Connection string** → **Prisma**,
or **Project Settings → Database → Connection string**. You'll see two:

| Type | Port | Use it for |
|---|---|---|
| **Direct connection** | `5432` | Simplest — use this alone as `DATABASE_URL`. |
| **Transaction pooler** | `6543` | High concurrency; pair with a direct `DIRECT_URL` for migrations. |

Replace `[YOUR-PASSWORD]` in the string with the database password from step 1.

**Simplest (recommended for the demo):** use the **Direct connection** string as
`DATABASE_URL` and stop there.

```
postgresql://postgres:YOUR-PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres
```

**Scaled (optional):** use the pooler for `DATABASE_URL` and the direct string for
`DIRECT_URL` (Prisma runs schema creation over `DIRECT_URL`):

```
DATABASE_URL = postgresql://...pooler...:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL   = postgresql://postgres:YOUR-PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres
```

## 3. Set it on Render

Render dashboard → your service → **Environment** → **Add Environment Variable**:

- `DATABASE_URL` = the connection string from step 2 (and `DIRECT_URL` if you chose the scaled option).

Save. Render redeploys automatically. On boot the app:

1. Detects the Postgres URL and switches the Prisma provider to `postgresql`.
2. Runs `prisma db push` — creates all tables in your Supabase database.
3. Runs the seed **only if the database is empty** (`--if-empty`) — so a populated
   database is **never wiped** by a redeploy.

Verify in Supabase → **Table Editor**: you should see `User`, `Job`, `Bid`,
`ServiceCreditAccount`, `AuditEvent`, etc. From now on the data persists across restarts.

## 4. (Optional) Share the same data with your PC

Put the same line in the repo-root `.env` and your local server will read/write the
**same** Supabase database as the live site — one shared source of truth:

```
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.xxxxxxxx.supabase.co:5432/postgres
```

Then run the usual local start. Leave `.env` unset to keep using the local SQLite file.

> `.env` is gitignored — your connection string is never committed.

---

## Notes

- **Switching back to SQLite:** remove `DATABASE_URL` (and `DIRECT_URL`). The provider
  reverts to `sqlite` automatically.
- **First seed:** to force a fresh seed against Postgres, temporarily set `FORCE_SEED=1`
  (this **wipes** the database — only for a clean reset), then remove it.
- **Money columns** are integer piasters (1 EGP = 100); they port to Postgres `Int`
  unchanged.
