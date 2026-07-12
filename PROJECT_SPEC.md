# AddiApp — Rebuild Project Spec

Living document. Updated as decisions are made. Last updated: 2026-07-12
(batched documentation sync folding in issues #25–#70; see §11).

## 1. Overview

AddiApp is being fully rebuilt from scratch — not migrated — as a gamified task
app. Core loop: a mascot-led home screen guides the user to one task at a time
(rather than presenting a full list), and completing tasks earns points with
bonuses for speed and daily volume. A separate clean "dashboard" surface handles
task management (add/edit/list) for users who want the admin view instead of
the guided flow.

Original codebase (Next.js + Supabase) is fully discarded — see audit summary
in §9. Nothing from it is being reused except the general concept (task
title/completed/timestamp) and font assets.

## 2. Tech stack (decided)

Chosen specifically to fit **KnownHost shared hosting** (cPanel, CloudLinux,
LiteSpeed, Node.js Selector via Passenger, MySQL/MariaDB — no root/SSH
confirmed yet, FTP-based deploy via GitHub Actions).

- **Frontend**: React 19 + Vite, static build (SPA, client-side routing via
  React Router v7). No Next.js — SSR/App Router doesn't fit shared hosting +
  FTP deploy well.
- **Backend**: Node.js + Express (TypeScript), run via cPanel's "Setup Node.js
  App" (Passenger).
- **Database**: MySQL/MariaDB (not Postgres — not available on shared cPanel
  plans). Local dev uses a MySQL 8.0 Docker container.
- **DB access layer**: **Drizzle ORM** (+ `mysql2` driver) — *resolved*. Schema
  in `server/src/db/schema.ts`; generated SQL migrations in `server/drizzle/`.
- **Auth**: custom, self-rolled — **DB-backed server-side sessions** (opaque
  random token in an httpOnly `sid` cookie, 7-day TTL, the `sessions` row is the
  source of truth so logout/expiry revoke immediately) + **bcryptjs** password
  hashing (pure-JS, no native build to compile on shared hosting). *Resolved:
  sessions, not JWT.* Not Supabase Auth, not Auth.js/NextAuth.
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite`, no config file —
  utility classes; brand accents used as arbitrary values, e.g. `bg-[#D85A30]`).
- **Transactional email**: **Resend** (TypeScript SDK, `RESEND_API_KEY`) —
  *decided provider* for verification + password-reset. Deliberately NOT Brevo
  (see CLAUDE.md for the reasoning). Note: the email features themselves
  (verification #61, password reset #62) are implemented on their own branches
  but are **not yet merged to `develop`** — they are not part of this release.
- **Deploy**: GitHub Actions. Static frontend build synced via FTP; Express
  backend deploy mechanism still open (FTP alone doesn't restart a Node
  process — need to confirm SSH availability on the shared plan).

Still open (see §10): Node.js version to target on KnownHost (Passenger),
SSH availability on the shared plan (drives backend deploy/restart).

## 3. Domain / infra (confirmed)

- Domain `addiapp.com`, live, proxied through Cloudflare.
- GitHub org: `neturely`, repo: `addiapp`.
- Existing FTP deploy workflow (`FTP-Deploy-Action`) exists but is stale/
  broken — it's on an unrelated static-site branch, has no build step, and
  wasn't built for a Next.js or Node app. Will be replaced.
- No data-loss concern — old codebase and live site are disposable.

## 4. Design direction

- **Mood**: bold, colorful, mascot-driven — Duolingo-style personality,
  not literal look.
- **Functional cleanliness**: Todoist/Linear-level clean UI chrome —
  personality lives in the mascot and gamification moments, not in
  cluttered chrome.
- **Structure idea from Trello**: liked conceptually, but not literally
  adopted (see §5 — home flow is single-task-at-a-time, not a board).
- **Mascot**: placeholder only for now (simple flat character used in
  mockups below). Real mascot design + expression variations (celebration,
  encouragement, idle, etc.) is a later, deliberate design pass — likely
  in Claude Design once UX flow is locked.
- **Color palette used in mockups so far**: warm coral primary
  (`#D85A30`), supporting teal/amber/purple for badges — not literally
  Duolingo green. Not yet locked as final brand palette.

## 5. Core UX flow — "Play" mode (mascot-guided home)

**Status: all Play-mode screens are BUILT** (issues #29–#34, #69), not just
mocked. They share one mascot / coral / spacing language. The flow:

1. **Home** (#29, `/`) — mascot + "Ready to do something great today?" + single
   "Let's go" primary CTA into the choice screen. Secondary links: "Add a task"
   (#35), "Dashboard" (#36), "Stats" (#38). If a task is mid-flight it also
   shows a **Resume** affordance (#69, see below).
2. **Choice screen** (#30, `/play`) — "What kind of win do you want?" →
   Something small (quick/low effort) vs Something big (real progress). A
   time-available filter (preset chips) sits alongside. Selections are carried
   to the task screen as URL params.
3. **Task presented** (#31, `/play/task`) — the selection algorithm (see below)
   picks ONE matching backlog task. Shows title, estimated time, effort tag, and
   approximate base points (shown up front per §7). Primary **Start** → moves the
   task to in-progress. Secondary "Give me something else" re-rolls, excluding
   the just-shown task.
4. **In-progress** (#33, `/play/progress/:id`) — a live count-up timer derived
   from the server's `startedAt` (survives refresh) plus a speed-bonus meter
   against the estimate. **Complete** → done (awards points, §7).
5. **Completion / celebration** (#34) — mascot + confetti-dot accents, "Nice
   work!", the TOTAL points earned (large, primary), and the current daily
   multiplier as brief context. **Keep going** skips the choice screen and offers
   another task reusing the same win/time filters; **Back to home** returns Home.
6. **Empty state** (#32) — when selection returns nothing: mascot + "Nothing
   here right now". Primary action is "Add a task" when the backlog is empty, or
   "Pick a different win" when filters just matched nothing.

**Resume (#69)**: because Play-mode selection only offers *backlog* tasks, a
started-but-unfinished task would otherwise be stranded. Home surfaces the most
recently started in-progress task as a "Resume: <title>" link to
`/play/progress/:id`; when more than one is in progress, a small "N tasks in
progress" link points to the Dashboard. This is an extension of the original
four-screen flow.

### Task-selection algorithm (resolved — was §10's oldest open item)

Lives behind a swappable interface in `server/src/tasks/selection.ts`:

```ts
type SelectionStrategy = (candidates: Task[], rng?: () => number) => Task | null
```

- The route (`GET /api/tasks/next`) does the **filtering** — win-type → complexity
  (`small` = {low, medium}, `big` = {medium, high}; medium is in both pools so the
  guided flow rarely dead-ends), time-available (`estimatedMinutes ≤ minutes`),
  status = backlog, and an optional `exclude` id for re-roll. The **strategy** only
  picks one from the filtered candidates — no selection logic inlined in the route.
- **Default strategy: `weightedByAge`** — weighted random favouring older tasks
  (rank-based weights: oldest heaviest, still random). Chosen for the "keep
  momentum" feel: nothing rots at the bottom of the backlog, but a re-roll still
  feels fresh (vs. pure random re-offering, or strict oldest-first reading like a
  to-do list). Rank-based weights keep the function pure/deterministically
  testable. Alternates `oldestFirst` and `uniformRandom` also ship.
- A **future per-user selection preference** is designed for — becoming
  `strategies[user.preference]` is a one-line change — but is **not built** (no
  settings page exists yet).

**Requirement (met)**: this flow is also usable from the Dashboard in a denser,
manual form — per-row **Start** on the Dashboard is the manual selection entry
point, so Dashboard users aren't locked out of the game loop.

## 6. Dashboard (admin view) — BUILT (#36–#38)

Clean, Todoist/Linear-style. Add/edit/list all tasks, manage the backlog, see
everything at once (not one-at-a-time like Play mode).

**Task list / management (#36, `/dashboard`)**:
- A dense **table** with **status filter tabs** (All / Backlog / In progress /
  Done, with counts).
- **Inline edit** of the four column fields (title, complexity, estimated
  minutes, status) — click a row to edit in place; only changed fields are
  PATCHed (an unchanged status doesn't re-trigger transition side effects).
- A per-row **Edit** action opens a **full edit page** (`/tasks/:id/edit`) — the
  structural home for fields beyond the table's columns (categories, tags, due
  dates, priorities) as those land. Today its field set matches the inline set. A
  shared `TaskForm` component backs both the Add form (#35) and this Edit page.
- Per-row actions: **Start** (backlog → in-progress screen; the manual selection
  entry), **Resume** (in-progress → #33), **Edit**, **Delete**.
- **Delete uses an undo toast**, not a confirm dialog: the row disappears
  immediately and the actual API DELETE is deferred (~5s); "Undo" cancels the
  pending timer. Fits the fast inline-edit model; fail-safe (navigating away in
  the window leaves the task). Header has **Play** and **Add task** buttons.

**Add-task form (#35, `/tasks/new`)**: title, complexity (segmented picker
showing base points up front), estimated minutes. Validation mirrors the CRUD
rules (§ below). Reachable from the empty state, Home, and the Dashboard.

**User points card (#37)**: at the top of the Dashboard — lifetime **total
points**, current **live daily multiplier**, and **today's** points + tasks.
Reads `GET /api/points`; refreshes as tasks complete. Links to the stats page.

**User stats page (#38, `/stats`)**: dedicated at-a-glance screen — total points
(hero) + stat tiles for **lifetime tasks completed**, **day streak** (consecutive
days with ≥1 completion in the app timezone), **total speed bonus earned**, and
the **current daily multiplier**, plus today's summary. Reads a richer
`GET /api/points/stats` (kept separate from the card's lean endpoint).

## 7. Points / gamification system — FINALIZED (#28)

All numbers are final and live in **one file, `server/src/points/config.ts`** —
tuning them after real usage never touches the calculation logic
(`server/src/points/calculate.ts`, pure math) or the award orchestration
(`server/src/points/award.ts`, DB writes). Base points are also surfaced to the
UI via `GET /api/points` so the front end never hardcodes them.

- **Base points by complexity** (set at task creation): Low = 2, Medium = 5,
  High = 10.
- **Estimated time**: user enters manually at task creation (minutes) —
  deliberately not derived from complexity, since they don't reliably correlate.
- **Speed bonus** — rewards finishing faster than estimated, scaled to time
  saved (saturation-based, anti-gaming):
  - `saved = clamp((estimated − actual) / estimated, 0, 1)`
  - `effective = min(saved / SPEED_BONUS_SATURATION, 1)` with
    `SPEED_BONUS_SATURATION = 0.5`
  - `speedBonus = round(basePoints × SPEED_BONUS_MAX_RATIO × effective)` with
    `SPEED_BONUS_MAX_RATIO = 1.0`
  - So: finishing in **≤50% of the estimate** earns the ceiling (**+100% of base
    points**); finishing exactly on/over the estimate earns 0; in between scales
    linearly. Beyond 50% faster gives no extra (a wild underestimate can't farm
    points). *Worked example:* a High task (base 10), estimated 30 min, done in
    15 min → saved 0.5 → effective 1.0 → speed bonus = 10.
- **Daily multiplier** — grows with each task completed that day, capped, resets
  at midnight in the app timezone:
  - `multiplier(n) = min(1 + (n − 1) × DAILY_MULTIPLIER_GROWTH, DAILY_MULTIPLIER_CAP)`
    with `GROWTH = 0.15`, `CAP = 2.0` → the cap is reached at the **8th** completed
    task of the day. Shown live in the UI as the value the *next* completion will
    earn (e.g. "×1.30 today").
- **Total for a completion**: `round((basePoints + speedBonus) × multiplier)`.
  *Worked example continuing the above, as the 3rd task of the day:*
  `multiplier(3) = 1.30`, total = `round((10 + 10) × 1.30) = 26`.
- **Timezone**: `APP_TIMEZONE` defaults to **`Europe/Stockholm`** (env-overridable);
  its midnight resets the daily multiplier / rolls the daily stats.
- **Idempotency**: points are awarded **exactly once per task, ever** — on its
  first completion. Re-opening a done task and completing it again does **not**
  re-award (the `points_log` ledger is checked by `task_id`).
- **Points are shown up front** (approximate base, before commitment) — decided
  explicitly: visibility is motivating; the speed bonus rewards finishing fast
  rather than the reward being a surprise.

The `points_log` ledger stores the award *components* (base / speed bonus /
multiplier / total) per completion, and `daily_stats` is the per-user/day rollup
that drives the multiplier — so the formula can be retuned without a schema
change.

## 8. Release scope

**Decided**: a genuinely minimal first release. Reconciled against what's now
actually built and merged to `develop`.

### Release 1 — status
- ✅ Custom auth (register/login/logout, bcryptjs + DB-backed sessions) — #26
- ✅ Task CRUD, user-scoped (title, complexity, estimated time) — #27
- ✅ Points system as defined in §7 (all numbers finalized) — #28
- ✅ Play mode: Home → Choice → Task presented → Start → In-progress →
  Completion, plus Empty state and Resume — #29–#34, #69
- ✅ Task-selection algorithm (weighted-random, swappable) — part of #31
- ✅ Dashboard: task list/management + inline edit + full edit page — #36
- ✅ Dashboard user points card — #37
- ✅ User points/stats page — #38
- ⬜ **Marketing / landing homepage** (#40) — the only remaining Release-1 item
  on the app itself; **not yet scoped**.
- ⬜ **Basic user guide / help content** (#41) — **not yet scoped**.
- ◻ Deploy pipeline (GitHub Actions build + FTP + Express restart) — #39, open;
  transactional email (Resend): verification #61 / reset #62 built on branches,
  **not yet merged**.

### Explicitly deferred to later releases
- Multi-user competitive features: leaderboards, scoreboard
- Projects (grouping tasks), Teams, task sharing for bonus points
- Per-user task-selection preference + settings page (interface is ready)
- Real mascot art + expression variations (placeholder used in v1)
- Anything else from `OLD_SPEC.md` not listed above (categories, tags, due
  dates, recurring tasks, attachments, notifications, dark mode, search,
  filtering, drag & drop, PWA/offline, audit history, AI-assisted management)

## 9. Old codebase audit — summary

Full audit was done via Claude Code (read-only) against the `addiapp`
repo. Key findings, for reference only — none of this is being carried
into the rebuild as code:

- Real app lived on `origin/develop`/`origin/main` (local working copy
  was a stale, unrelated static-site snapshot).
- Stack was Next.js 15.4.4 (App Router) + React 19 + Supabase JS
  (client-only, anon key) + Tailwind v4. No API routes, no components
  layer.
- Auth was Supabase email/password (not Auth.js, despite the old spec
  document) — and was broken: middleware checked for a cookie
  (`sb-access-token`) that the client-side Supabase SDK never sets
  (it uses localStorage), causing a redirect loop after sign-in.
- Single DB table `addiapp` (id, title, completed, inserted_at), no
  migrations in repo, no user-scoping in queries (RLS status unknown).
- No working deploy pipeline for the actual app — the only FTP workflow
  present was on an unrelated branch, had no build step, and targeted a
  static site, not a server-rendered Next.js app.
- `OLD_SPEC.md` (kept for roadmap ideas only) had drifted significantly
  from the real implementation on auth, API routes, deployment target,
  table naming, and env vars.

## 10. Open questions log

Rewritten in this sync — resolved items removed. Genuinely still open:

- [ ] **Node.js version** to target on KnownHost (Passenger / Node.js Selector).
- [ ] **SSH availability** on the KnownHost shared plan (drives backend
  deploy/restart mechanism; assume FTP-only until confirmed). Deploy pipeline
  rewrite is #39.
- [ ] **#40 marketing / landing homepage** — scope/content not defined.
- [ ] **#41 user guide / help content** — scope/content not defined.
- [ ] **Production email readiness** — Resend domain verification for
  `addiapp.com` (#65) before the email features (#61/#62) can be relied on in
  production.
- [ ] **General signup rate-limiting / abuse protection** on auth endpoints.
- [ ] **Privacy policy / Terms of Service** pages (needed before public launch).
- [ ] **Home secondary-link tension** — the original mockup called for a
  "Dashboard" secondary link; the built Home now carries Add task / Dashboard /
  Stats. Whether that's the right long-term set (vs. a single Dashboard entry) is
  an open UX call noted at #29's merge.
- [ ] Final color palette / brand direction (mockups use placeholder warm coral).
- [ ] Real mascot art (placeholder flat character in use).

## 11. Change log — documentation sync (2026-07-12)

This spec was last substantively updated at #24 (scaffolding). This pass folds in
the merged work #25–#70 (schema #25, auth #26, task CRUD #27, points #28, Play
mode #29–#34, add-task #35, dashboard #36, points card #37, stats #38, resume
#69) ahead of the `develop → main` promotion. Where docs and code disagreed, code
won. Not covered here because they are **not merged to `develop`**: deploy
pipeline (#39), email verification (#61) / password reset (#62), and the
still-unscoped #40/#41.
