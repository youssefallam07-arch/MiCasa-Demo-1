# MiCasa — Product Guide

**A complete, business-facing walkthrough of the entire platform**

*Prepared for stakeholders and business reviewers. Every app, every screen, and what each option does — illustrated with live screenshots of the working software.*

---

## Table of contents

1. [What MiCasa is (in one page)](#1-what-micasa-is-in-one-page)
2. [How the business makes money](#2-how-the-business-makes-money)
3. [The four surfaces at a glance](#3-the-four-surfaces-at-a-glance)
4. [The Customer App](#4-the-customer-app) — *the demand side*
5. [The Worker App](#5-the-worker-app) — *the supply side (“sanaey3eya”)*
6. [CIC — the Operations Console](#6-cic--the-operations-console) — *run the marketplace day-to-day*
7. [CENTCOM — the Owner Terminal](#7-centcom--the-owner-terminal) — *own and govern the whole platform*
8. [Roles & permissions](#8-roles--permissions)
9. [Business rules you can change (Config)](#9-business-rules-you-can-change-config)
10. [Reporting, data export & audit](#10-reporting-data-export--audit)
11. [What’s live vs. what’s stubbed (roadmap)](#11-whats-live-vs-whats-stubbed-roadmap)
12. [Appendix — demo logins](#12-appendix--demo-logins)

---

## 1. What MiCasa is (in one page)

**MiCasa is a two-sided home-services marketplace for Egypt.** Households need a plumber, an electrician, an AC technician, a carpenter — MiCasa connects them with **vetted tradespeople** (in Egyptian Arabic, *sanaey3eya* / صنايعية) and lets those tradespeople **compete for the job by bidding**.

The model is deliberately **“reverse-auction / name-your-price,”** the same shape that made ride-hailing apps like inDrive work:

> A customer describes the problem and states a budget → nearby specialists send competing offers (a price + an arrival time) → the customer picks the one they like → the specialist does the job → the customer pays the specialist **in cash**, confirms completion, and rates them.

**The platform never touches the job payment.** Customers pay workers directly. Instead, MiCasa earns a **commission** on every completed job, collected through a **prepaid “service-credit” wallet** that each worker tops up in advance. This is the single most important business idea in the product and is explained in the next section.

**Why this design is attractive to operate:**

- **Cash-flow safe** — because commission is *pre-funded* by the worker before they can even bid, the platform is never chasing unpaid fees.
- **Quality-controlled** — workers are personally vetted (interview + guarantor + trial) before they can take jobs, and a strike system removes unreliable ones automatically.
- **Fully instrumented** — every job, every bid, every pound of commission, and every admin action is recorded and exportable to Excel. An AI “Brain” console reads the live platform and answers plain-language questions.

The whole product is built as four connected apps served from one place. Here is the front door — the **Launchpad** — which links to every app and lists the demo logins:

![MiCasa Launchpad — the menu that links to every app, with demo logins](img/00-launchpad.png)

---

## 2. How the business makes money

This is the commercial heart of MiCasa, so it’s worth stating precisely.

### The commission

- On every **standard** job, the platform’s commission is **12%** of the winning bid.
- On every **priority / emergency** job, the commission is **17%**.
- Both rates are **not hard-coded** — an administrator can change them at any time from the Config screen (see §9).
- The commission is calculated on the **worker’s winning bid price**, not the customer’s original budget.

### The prepaid “service-credit” wallet

Every worker holds a **prepaid credit balance** with MiCasa. Think of it as a float the worker deposits in advance. It exists **only** to pay platform commissions — it is **not** the worker’s job earnings, and it is **non-withdrawable** (returned only if they close their account). The wallet has three buckets:

| Bucket | Arabic label | Meaning |
|---|---|---|
| **Available** | الرصيد المتاح | Free credit the worker can spend right now on commissions. This is what lets them bid. |
| **Held** | محجوز عمولة | Commission locked against jobs they’ve won but not yet finished. Not spendable; returned if the job is cancelled. |
| **Debt / Owed** | مستحق عليك | A negative position that must be cleared before bidding again (legacy — see note below). |

### The money flow: Hold → Capture → Release

MiCasa uses an escrow-style model so nobody can game the system:

1. **HOLD** — the moment a customer **accepts** a worker’s bid, the commission is **held** from the worker’s *available* credit (moved into *held*). The worker has now committed.
2. **CAPTURE** — when the job is **completed** (customer confirms, or automatically after 72 hours if they don’t), the held amount is **captured** and becomes **platform revenue**.
3. **RELEASE** — if the job is **cancelled** (and confirmed), the held commission is **released** straight back to the worker’s available credit.

### Anti-fraud: prepaid-only bidding

A worker can only bid if their available credit already covers the commission. If they can’t cover it, they simply **can’t bid** on that job (the app tells them to top up first). This guarantees the platform’s fee is always funded *before* a job is taken — the worker can never take a job they can’t pay commission on.

**Under the hood** (for the technically curious): all money is stored as **integer piasters** (1 EGP = 100 piasters) to avoid rounding errors, and the hold/accept operation is a **guarded atomic transaction** — a worker’s wallet can never overdraw and a job can never be double-accepted, even if two people click at the same instant.

> **Legacy note:** the system still carries a “postpaid grace period” concept (a new worker running their first few jobs on credit-debt). In the current live logic this path is switched off — everything is **prepaid-only**. The Config field still exists but doesn’t grant grace jobs today.

### How the money is collected

Workers add credit through **manual top-ups** — they transfer money via **Vodafone Cash** or **InstaPay**, then an administrator confirms receipt and the credit appears. (A fully automated payment gateway is on the roadmap.)

---

## 3. The four surfaces at a glance

MiCasa is one platform with four distinct apps, each for a different audience. Everything is served from a single web address; the Launchpad above links to all of them.

| # | Surface | Who uses it | What it’s for |
|---|---|---|---|
| 1 | **Customer App** | Households | Find or post a home-service job, receive bids, accept, track, pay cash, rate. Also a small **marketplace** to buy home hardware. |
| 2 | **Worker App** | Tradespeople (*sanaey3eya*) | Go online, browse the job feed, bid (price + ETA), do the job, manage the prepaid wallet and earnings. |
| 3 | **CIC** — *Control & Information Center* | Operations staff / moderators | Run the marketplace: vet workers, confirm top-ups, approve refunds, watch platform health via the AI “Brain.” |
| 4 | **CENTCOM** | The owner | Govern the whole business: every account, impersonate any user, onboard workers, set commission rates, export all data. |

**A simple way to remember the split:** **CIC runs the marketplace; CENTCOM owns and governs the whole platform** (including CIC’s own staff accounts).

Architecturally, the customer and worker apps never touch the database directly — they talk to a single secure gateway (internally called *Centcom*) which is the only component that holds the business logic and the money. This keeps the money safe and the system auditable.

---

## 4. The Customer App

*The demand side. A polished, mobile-first app. Customers can either describe a problem in plain language and let the app find specialists, or browse 24 trade categories. It also includes a home-hardware marketplace, a loyalty-points wallet, and a “Home Health” maintenance tracker.*

### 4.1 Signing in / creating an account

The customer signs in with an email/username and password, or taps **Create Account** to register (name, email, phone, password). Egyptian mobile numbers are validated, and passwords must be reasonably strong.

![Customer login screen](img/cust-01-login.png)

### 4.2 Home — the dashboard

After login the customer lands on a personalised home screen: a time-based greeting, and the two core choices — **Find Services** (book a tradesperson) and **Buy Products** (the marketplace). Notice the live **petrol-index ticker**: MiCasa’s suggested prices include a travel fee that recalibrates daily with fuel prices, which the app surfaces transparently. A row of trust stats (pros online, average rating, average response time) reinforces confidence.

![Customer home screen — Find Services, Buy Products, live petrol/travel ticker, trust stats](img/cust-02-home.png)

Key elements on this screen:

- **Find Services** card → opens the service finder (§4.3). Sub-label reminds the customer they get *“vetted specialists across 24 trades — name your price.”*
- **Buy Products** card → opens the MiCasa Market (§4.7).
- **Bell (top-right)** → notifications (booking confirmations, order updates, maintenance reminders, price-drop alerts), with an unread badge.
- **Smart Picks** — up to four AI-personalised suggestion tiles (e.g. an overdue home system, a seasonal “Summer AC tune-up,” or “book your usual trade again”).
- **Home Health card** — a 0–100 score for the state of the customer’s home systems (see §4.9).
- **Petrol/travel ticker** — today’s fuel index and per-km travel fee, with the daily change.

### 4.3 Find a Service — natural-language AI diagnosis

The customer can simply **describe the problem** (“the bathroom flush isn’t working and the AC won’t cool”) and the built-in **Casa AI** diagnoses it: it assigns a priority (Routine → Critical), detects the relevant trade(s) **with a confidence level**, gives an **estimated cost range including parts**, and even **splits multiple issues** into separate bookings. There are also one-tap “quick problem” chips, and the full grid of **24 trades** underneath.

![Casa AI diagnosis — detects two separate issues (Plumbing + AC), estimates cost, and offers to book each](img/cust-04-ai.png)

The **24 trades** covered: Plumbing, Electrical, AC & HVAC, Appliances, Carpentry, Painting, Cleaning, Pest Control, Gardening, Moving & Freight, Locksmith, Glass & Aluminum, Tiling & Marble, Plaster & Gypsum, Roofing & Waterproofing, Satellite & TV, IT & Networks, CCTV & Security, Car Mechanic, Welding & Metal, Curtains & Decor, Pumps & Tanks, Elevator Tech, and Handyman.

![Find a Service — quick-problem chips and the 24-trade category grid](img/cust-03-services.png)

### 4.4 Nearby specialists — live map & ranked list

Once a trade is chosen, the customer sees a **live map** of available specialists around their location (detected by GPS or a saved address), a **supply-and-demand meter** (Calm / Busy / Surge, with the current price multiplier and how many requests are open), and a **ranked list** of specialists they can sort by **Nearest / Top rated / Best price**. Each specialist card shows rating, jobs completed, distance, ETA, trust tags (“Same-day,” “10+ yrs exp,” “Own tools”), and a “from EGP …” estimate — plus occasional deal badges.

![Nearby specialists — live Cairo map, surge meter, and ranked specialist cards](img/cust-05-specialists.png)

Tapping a specialist’s **photo** opens their full profile (stats, reviews, bio); tapping the **card** moves to the offer screen.

### 4.5 Set Your Offer — the “name your price” core

This is the signature screen. The customer sees a **transparent fare breakdown** — callout base, travel fee (indexed to today’s petrol price), and the supply/demand multiplier — leading to a **suggested fair price**. They can accept it or **name their own price** with the +/− stepper, guided by live hints (“Fair price — high acceptance odds,” “Very low — will decline”). Extras include a **24-hour Smart-Schedule forecast** that highlights the cheapest upcoming hour, an **attach-a-photo** option, an **emergency-dispatch** toggle (priority broadcast, +35% suggested), and a pay-with selector (cash / wallet / card).

![Set Your Offer — fare breakdown, smart-schedule forecast, and the name-your-price stepper](img/cust-06-bid.png)

Pressing **Broadcast Offer** posts the job to the platform and opens the live offers screen, where incoming bids from specialists appear in real time; each is marked *“accepts your offer”* or *“counter-offer,”* and the customer can nudge the price up (+10 / +25) to attract faster responses, then **Accept** the one they want.

After accepting, a **live tracking** screen shows a 5-stage timeline (accepted → en route → arrived → in progress → complete), a call button, and — once the specialist marks the job done — a **“Confirm the job is done”** button. Confirming completes the job (which is what captures the platform’s commission) and opens the **rating** screen (stars, quick tags, and an optional tip). The customer earns loyalty points on completion.

### 4.6 (Cancellation) 

If the customer cancels before a specialist is assigned, it’s free and instant. If they cancel an accepted job, the specialist must confirm — and the held commission is released back to the specialist. “No charge within the first few minutes” is shown to the customer.

### 4.7 MiCasa Market — the hardware shop

Beyond services, the app has a small **marketplace** of home-hardware products from trusted local shops (electrical supplies, sanitary ware, tools & paint). Customers search, browse by shop, view product detail (specs, warranty, stock), add to a cart, apply promo codes, choose a delivery address, and check out (cash / wallet / card). Delivery fees are petrol-indexed like the service travel fee.

![MiCasa Market — local shops and home-hardware products](img/cust-07-market.png)

### 4.8 Profile, wallet & loyalty

The profile screen holds the customer’s account, a **MiCasa Points** loyalty balance (2% back on every job and order, redeemable for wallet credit), a **MiCasa Wallet** (top-up, transaction history, points redemption), saved **payment methods** (cash or Visa cards, validated on entry), saved **addresses** (with a map pin-picker), and a **language switch** (English / Arabic / French / Russian — the whole UI re-renders, RTL for Arabic).

![Customer profile — points, wallet, payment methods, addresses, language](img/cust-08-profile.png)

![MiCasa Wallet — balance, top-up, redeem points, transactions](img/cust-10-wallet.png)

### 4.9 Home Health — a retention feature

MiCasa quietly tracks the health of the customer’s home systems (AC, plumbing, electrical, pest, cleaning, water tank, appliances) based on completed jobs, gives an overall **health score**, and flags what’s **due soon** or **overdue** — each with a one-tap **Book** button. It’s a smart re-engagement engine that turns one-off jobs into recurring maintenance revenue.

![Home Health — per-system status with one-tap re-booking](img/cust-09-homehealth.png)

---

## 5. The Worker App

*The supply side. An Arabic-first, inDrive-style app for tradespeople. The worker goes online, sees jobs in their trades and area, bids a price and arrival time, does the job, and manages a prepaid wallet. The latest version added multi-profession support and a richer profile.*

### 5.1 Signing in

Workers sign in with a username and password. The app rejects customer accounts (“this is a customer account, not a worker”). New workers register with their name, phone, trade, and area — and are told up front that **an administrator must approve their account before they can take work.**

![Worker login — “MiCasa صنايعي”](img/wrk-01-login.png)

### 5.2 The job feed — “شغل” (Work)

The worker toggles **online** to start receiving jobs. The header always shows their name, rating, verification status, and **service-credit balance** (with a **top-up “اشحن”** button). Because a worker can hold **multiple professions**, a row of filter chips lets them switch between trades (here: *All / Plumbing / AC*). Each job card shows the trade, area, the customer’s offered budget, the number of competing bids, and either a **“Place your bid”** button or — if the worker already bid — their submitted price and ETA.

![Worker job feed — online toggle, service credit, multi-profession filters, and a live job card](img/wrk-02-feed.png)

If the worker isn’t approved yet, the feed is replaced by an **“account under review”** notice — no jobs and no bidding until an admin approves them. If their credit can’t cover a job’s commission, that job shows **“top up first.”**

### 5.3 Placing a bid

Tapping **“Place your bid”** opens a sheet pre-filled with the customer’s offer. The worker sets their **price** (±10 EGP stepper) and **arrival time** (±5 min stepper). A live line shows exactly how much commission will be **held** from their credit if they win — and whether their balance covers it (green = you can bid; red = top up first). Submitting sends the offer; if the customer accepts, the commission is held and the job moves to the worker’s active work.

![Placing a bid — price and ETA steppers with a live commission-coverage check](img/wrk-03-bidsheet.png)

Once a bid is accepted, the job appears under **“your current work”** with a call button and a **“I finished the job”** button. Marking it done captures the commission (the customer pays the worker in cash separately).

### 5.4 Wallet — prepaid service credit

The wallet screen shows the three buckets — **available**, **held commission**, and (if any) **debt** — with a clear disclaimer that the balance is for platform commission only and is non-withdrawable. A full **transaction ledger** lists every top-up, hold, capture, release, and adjustment.

![Worker wallet — available / held / debt, with the transaction ledger](img/wrk-04-wallet.png)

**Topping up** opens a sheet with preset amounts and a payment method (Vodafone Cash / InstaPay). The request is submitted with a reference number and waits for an administrator to confirm receipt before the credit lands.

![Top-up sheet — preset amounts and Vodafone Cash / InstaPay](img/wrk-05-topup.png)

### 5.5 Earnings — “الأرباح”

A simple record of completed jobs and total commission paid. (It tracks *commission paid*, not gross income, because the customer pays the worker in cash directly — the platform only ever sees the commission.)

![Earnings — completed jobs and commission paid](img/wrk-06-earnings.png)

### 5.6 Profile — the richer worker profile

The profile is where the “richer profile” work shows: a **trust banner** reflecting verification stage (under review → interviewed → trial → approved) and probation status, a **reputation tier** badge (New → Certified → Silver → Gold, earned through jobs and ratings), a **bio**, the worker’s **professions** (multi-select), their **work zone**, and a stats grid (rating, jobs finished, service credit, commission paid). A settings menu covers editing trades/zone, order-alert notifications, a “how it works” guide, and support contacts.

![Worker profile — trust banner, tier badge, bio, multi-profession chips, and stats](img/wrk-07-profile.png)

Editing opens a sheet to **pick multiple professions**, choose a **work zone**, and write a **bio** — the multi-profession and richer-profile capability in action.

![Edit profile — pick multiple trades, zone, and bio](img/wrk-08-editprofile.png)

### 5.7 Reliability controls (behind the scenes)

If a worker cancels accepted jobs too often (more than the configured threshold within 30 days), they receive a **strike**; enough strikes **auto-suspend** them. This protects customers and keeps the marketplace reliable without manual policing.

---

## 6. CIC — the Operations Console

*The “Control & Information Center.” This is the day-to-day cockpit for operations staff: vetting workers, confirming top-ups, approving refunds, overriding stuck jobs, editing business rules — and an AI-powered intelligence layer that scores platform health and answers plain-language questions. Everything refreshes live every 5 seconds.*

CIC is organised as a left sidebar with ten sections. Nav items show a **badge** when something needs attention (e.g. workers awaiting verification).

### 6.1 The Brain — live intelligence & Casa AI

The default landing screen. A **health score (0–100)** with four sub-scores — **Coverage** (are jobs drawing bids?), **Trust** (ratings & worker standing), **Liquidity** (credit float vs debt), and **Throughput** (completed vs cancelled). Below it, four “lenses”:

- **SENSE** — live vitals (jobs today, active jobs, open jobs, approved workers, money in escrow, commission today and over 7 days).
- **DIAGNOSE** — an **anomaly radar** that auto-flags issues (open jobs with no bids, stalled escrow, verification backlog, top-ups awaiting confirmation, workers on quality watch…).
- **PREDICT** — a **demand-vs-supply table** by trade and zone, highlighting where the platform is short of workers.
- **ACT** — **one-click recommendations** on real actions (force-complete a stalled job, confirm a top-up, open the verification queue…).

At the bottom, the **Casa Brain** console lets staff **ask about the platform in plain language** (“which zones need workers?”, “who’s high risk?”). When an AI key is configured, answers are generated by Claude reasoning over a live snapshot (badged **“Casa AI”**); otherwise a built-in engine answers from the same data. There are also focus tabs (Growth / Trust / Liquidity) that re-prioritise what surfaces first.

![CIC — The Brain: health score, SENSE/DIAGNOSE/PREDICT/ACT lenses, and the Casa AI console](img/cic-02-brain.png)

### 6.2 Dashboard

A top-line KPI board: jobs today, jobs total, average bids per job, completion rate, commission captured, worker count, pending releases, and workers awaiting vetting — plus a table of the most recent jobs.

![CIC Dashboard — headline KPIs and recent jobs](img/cic-03-dashboard.png)

### 6.3 Verification — the vetting queue

The founder-led vetting pipeline. Each applicant can be advanced through **Interview → Trial → Approve**, or **Rejected**. Only **approved** workers can bid and take jobs.

![CIC Verification — advance workers through interview, trial, approve, or reject](img/cic-04-verification.png)

### 6.4 Jobs — with admin overrides

A table of the latest jobs with trade, zone, urgency, budget, commission, bids, customer, and status. For jobs that get stuck (accepted / worker-done / cancel-pending), staff can **Force-complete** (captures the commission) or **Force-cancel** (releases it) — each requires a written reason that’s logged.

![CIC Jobs — full job table with force-complete / force-cancel overrides](img/cic-05-jobs.png)

### 6.5 Wallets — service credit oversight

Platform-wide totals (**credit float**, **in escrow / held**, **outstanding debt**, **commission captured**) and a per-worker table of every wallet: verification, wallet mode, available/held/debt, jobs completed, rating, and strikes.

![CIC Wallets — platform credit totals and per-worker balances](img/cic-06-wallets.png)

### 6.6 Top-ups — confirm received payments

The queue of workers who requested a top-up (paying via Vodafone Cash / InstaPay). Once the transfer is received, staff click **Confirm received** and the worker’s credit is added (settling any debt first).

![CIC Top-ups — confirm received transfers to credit workers](img/cic-07-topups.png)

### 6.7 Releases — approve cancellation refunds

When a worker cancels an accepted job, the held commission waits here for review before release. Crucially, the queue flags **“contacted first — off-app risk”** in red when a worker admits contacting the customer before cancelling (a sign they may be trying to take the job off-platform to dodge commission).

![CIC Releases — approve held-commission refunds, with an off-app fraud flag](img/cic-08-releases.png)

### 6.8 Config — the business rules

Every economic rule lives here and nothing is hard-coded (full table in §9): standard/priority commission %, minimum top-up, cancellation-strike thresholds, and more. Editing a value instantly changes marketplace economics.

![CIC Config — live-editable commission rates and platform thresholds](img/cic-09-config.png)

### 6.9 Data Log — the audit trail

Every meaningful change while the system is online — account created/deleted, worker verified/suspended, job completed/cancelled, config changed, top-up confirmed — with timestamp, actor, action, and detail. One click exports the whole thing to **Excel**.

![CIC Data Log — the full audit trail with Excel export](img/cic-10-audit.png)

*(A tenth section, **Password**, lets an admin change their own login.)*

---

## 7. CENTCOM — the Owner Terminal

*The owner’s master command center. Where CIC runs the marketplace, CENTCOM governs the whole business: it sees every account (customers, workers, and admins), can open any account’s app “as” that user, onboards workers personally, sets the platform’s rates and rules, controls who has admin access, and exports all data — including staff passwords — to Excel.*

CENTCOM auto-refreshes every 5 seconds and has a keyboard **command palette (Ctrl/⌘-K)** to jump anywhere. Its sidebar is grouped into **People**, **Platform**, and **System**.

### 7.1 Launchpad & Command Deck

The **Launchpad** is a board that opens, copies, or shares every app in the platform (each with a live up/down status dot), plus a phone-friendly network address for demoing on a real device. The **Command Deck** is the executive dashboard — customers, workers, approved, pending, suspended, total commission revenue, money in escrow, and revenue today, with a 7-day commission chart and the active districts.

![CENTCOM Launchpad — open/copy/share every app, with live status](img/cc-02-launchpad.png)

![CENTCOM Command Deck — the whole platform’s KPIs at a glance](img/cc-03-commanddeck.png)

### 7.2 Customers — every customer account

A master list of every customer: contact details, verification, wallet balance, loyalty points, language, last seen. Per-row, the owner can **Open as** (see §7.6) or **Set pw** (generate a one-time password).

![CENTCOM Customers — the master customer registry](img/cc-04-customers.png)

### 7.3 Workers — every provider

Every tradesperson with their ID document, trade, verification status, rating, wallet mode, available/held/debt credit, jobs completed, and strikes. Per-row actions: **Suspend / Unsuspend**, **Approve**, **Open as**, and **Set pw**.

![CENTCOM Workers — every provider with vetting, credit, and ratings](img/cc-05-workers.png)

### 7.4 Onboard Worker — founder-led vetting

The owner recruits a tradesperson in person and registers them here: full name, phone, national ID, trade, a **guarantor** (name + phone), and an ID photo. An **“approve immediately (I’ve vetted this worker in person)”** checkbox creates them ready to work. The system generates their username and a one-time password.

![CENTCOM Onboard Worker — personally vet and register a tradesperson](img/cc-06-onboard.png)

### 7.5 Service Credit, Trust & Liquidity

**Service Credit** is the money control room — total captured, in escrow, credit float, outstanding debt — plus the same **top-up confirmation** and **cancellation-release** queues as CIC, in one place. **Trust & Liquidity** combines the vetting pipeline, an “ops watchtower” of unmatched jobs (with a nudge action), and a **district-expansion signal** that surfaces customer demand in areas MiCasa hasn’t activated yet — a data-driven guide for where to expand.

![CENTCOM Service Credit — captured, escrow, float, debt, and the top-up/release queues](img/cc-07-credit.png)

![CENTCOM Trust & Liquidity — vetting pipeline, unmatched-jobs watchtower, and expansion signals](img/cc-08-trust.png)

### 7.6 “Open as” — impersonate any account

One of CENTCOM’s most powerful support tools. The owner can **open any account’s app exactly as that user** — customer, worker, or admin — **without knowing or resetting their password**, to reproduce a complaint or verify what someone sees. It mints a **short-lived (30-minute)** session that carries the target’s own permissions (not owner superpowers) and records who launched it in the audit trail.

### 7.7 Config — the single source of truth

The owner’s master version of the rules table: standard/priority commission, minimum top-up, grace/probation settings, cancel thresholds, strikes, an earnings guarantee for an early cohort, minimum rating, and the list of **active districts** where bidding is live.

![CENTCOM Config — every rate and threshold, live-editable](img/cc-09-config.png)

### 7.8 Access Control & Audit Log

**Access Control** lists who can enter CENTCOM, lets the owner **add administrators** (moderators), change their own password, and **download the full registry to Excel** (including staff passwords — see §10). **Audit Log** is the oversight trail of every privileged action, newest first.

![CENTCOM Access Control — manage admins and export the registry](img/cc-10-access.png)

![CENTCOM Audit Log — every privileged action recorded](img/cc-11-audit.png)

### 7.9 The “classic” terminal (advanced tools)

A leaner, secondary CENTCOM (“Advanced Admin Tools”) is kept as a fallback for power operations — a unified registry of **all** accounts with role filters, **Open-as**, one-time password resets, permanent account **deletion** (the last admin can’t be deleted), and the Excel export. It duplicates functions already in the polished terminal above and is aimed at technical operators.

---

## 8. Roles & permissions

| Role | Can do |
|---|---|
| **Customer** | Register/login; post jobs; view & accept bids; track; confirm completion; cancel own jobs; rate the worker; use the marketplace, wallet, points, and Home Health. |
| **Worker** | Register/login (starts *pending*, must be approved); go online; browse the filtered feed; bid (if verified, funded, not suspended); mark jobs done; manage wallet & top-ups; edit a multi-profession profile; rate the customer. |
| **Admin (CIC)** | Everything operational: dashboards & the Brain; verify/suspend workers; confirm top-ups; approve releases; force-complete/cancel jobs; edit config; view wallets & jobs; export data. |
| **Owner (CENTCOM)** | Everything: the full account registry; **Open-as** any user; onboard workers; one-time password resets; delete accounts; grant/revoke admin access; set rates & rules; export all data including staff passwords. |

A note on security: ordinary customer/worker passwords are stored only as one-way encrypted hashes and can never be read or exported. Only **staff** passwords that the owner sets are recorded (to a private, non-committed file) so the owner retains control of admin access.

---

## 9. Business rules you can change (Config)

Every rule below is editable from CIC or CENTCOM — no code change needed. Defaults shown.

| Setting | What it controls | Default |
|---|---|---|
| **Standard commission** | Platform fee on standard jobs | **12%** |
| **Priority commission** | Platform fee on priority/emergency jobs | **17%** |
| **Minimum top-up** | Smallest wallet top-up allowed | **EGP 100** |
| **Cancellations before a strike** | Worker cancels within 30 days before a strike is applied | **3** |
| **Strikes before auto-suspend** | Strikes accumulated before a worker is automatically suspended | **3** |
| **Auto-capture window** | Hours after a worker marks a job done before commission is captured automatically if the customer never confirms | **72h** |
| **Postpaid grace jobs** *(legacy)* | Jobs a new worker could run on credit before prepaid — currently inactive | **3** |
| **Active districts** | The zones where bidding is live (e.g. Maadi, Nasr City, Zamalek, Heliopolis) | *configurable* |

*(CENTCOM exposes a few additional early-stage levers — an earnings guarantee for the first cohort of workers, a probation-jobs count before priority bidding unlocks, and a minimum rating — for future growth experiments.)*

---

## 10. Reporting, data export & audit

- **Excel export** — one click from CIC (Data Log) or CENTCOM (Access Control) downloads a live workbook built fresh from the database, with sheets for: an **Overview** of KPIs, **Customers**, **Workers** (with wallet balances), **Owners & Moderators** (with the staff passwords the owner set), **Demo logins**, and the full **Audit Log** (up to 5,000 events).
- **Audit trail** — every privileged action (verifications, force-overrides, config changes, impersonations, password resets, deletions, top-up confirmations) is timestamped with the actor and details, viewable in both consoles and included in the export.
- **Live intelligence** — the CIC Brain turns all of this into a health score, anomaly alerts, demand forecasts, and plain-language answers, so operators don’t have to read raw tables to know what needs attention.

---

## 11. What’s live vs. what’s stubbed (roadmap)

**Working end-to-end today:** account creation & login; posting jobs; bidding; accept → complete → confirm → rate; the full commission hold/capture/release money flow; prepaid wallets & manual top-ups; worker vetting, strikes & suspensions; admin overrides; the CIC Brain & Casa AI; the CENTCOM owner tools; Excel export & audit; the customer marketplace, points, and Home Health (client-side).

**Deliberately stubbed / on the roadmap:**

- **Automated payment gateway** (Vodafone Cash / InstaPay) — today top-ups are confirmed manually by an admin.
- **SMS / phone verification** — today it’s username + password (the customer app has a simulated OTP flow ready to wire up).
- **Job photo upload & storage** — the data model supports it; the pipe isn’t connected.
- **Full production deployment** at scale.

The persistence layer already supports switching from the local demo database to a cloud database with a single setting, so the platform is ready to run always-on.

---

## 12. Appendix — demo logins

All demo passwords are `password123` (admin excepted — it’s generated per environment and kept private).

| Role | Open in | Username | Notes |
|---|---|---|---|
| Customer | Customer App | `mona` | Has existing jobs |
| Customer | Customer App | `khaled` | Has existing jobs |
| Worker | Worker App | `ahmed` | Approved · funded · can bid now (plumbing + AC) |
| Worker | Worker App | `mahmoud` | Approved · funded · can bid now (electrical + appliances) |
| Worker | Worker App | `saeed` | Pending — approve him in CIC to demo vetting |
| Admin / Owner | CIC & CENTCOM | `youssef_hq` | Password kept private per environment |

**Suggested demo loop:** as **mona**, post a plumbing job in Maadi → as **ahmed**, bid on it → back to **mona**, accept → **ahmed** marks it done → **mona** confirms & rates → watch it all update live in **CIC** and **CENTCOM**.

---

*This guide reflects the software as built and running. Screenshots are of the live application. Business rules (commission, thresholds, active districts) are configurable and may differ from the defaults shown here once tuned for launch.*
