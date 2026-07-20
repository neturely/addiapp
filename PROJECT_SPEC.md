# AddiApp — Rebuild Project Spec

Living document. Updated as decisions are made. Last updated: 2026-07-20
(mascot v3 star-character, PlayCard Phase 2, and FormCard now BUILT + on develop for
the 1.7.0 release; supersedes the 2026-07-19 "filed, not built" sync).
Note: **CLAUDE.md is the more frequently-synced authoritative reference** — where the
two disagree, prefer CLAUDE.md and the code on `develop`.

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

Fit to the **KnownHost Basic Plus Reseller** account (cPanel/CloudLinux/LiteSpeed,
MySQL, SSH available) — the SAME box as wptips.com. The plan does **not** run
Node.js apps (no CloudLinux Node.js Selector), which drove the PHP backend.

- **Frontend**: React 19 + Vite, static build (SPA, React Router v7). No Next.js.
  Served from the docroot; `.htaccess` (shipped from `client/public/`) does
  client-side routing.
- **Backend**: **plain PHP 8.2 + PDO** (`api/`) — no framework, no Composer
  runtime deps. Rewritten from Node/Express/Drizzle (#77) after Node turned out to
  be unavailable on the plan; the HTTP contract was preserved so the client was
  untouched. A thin front controller + minimal router; controllers in
  `api/src/Controllers/`. Verified on the account: PHP 8.2 (7.4–8.5 available),
  extensions pdo_mysql/curl/openssl/mbstring/etc.
- **Database**: MySQL/MariaDB. Local dev uses a MySQL 8.0 Docker container.
- **DB access**: **plain PDO** (parameterized). Schema is hand-written SQL in
  `api/migrations/`, applied by `api/migrate.php` (tracked in `_migrations`). No
  ORM.
- **Auth (#26, #61, #62, #67, #80)**: custom — **DB-backed sessions** (opaque
  httpOnly `sid` cookie, 7-day TTL) + **bcrypt** (`password_hash`). Registration
  creates an unverified account + emails a link; **login is blocked until
  verified**; register survives email-send failures (best-effort, #67). **Password
  reset** sets a new password + **revokes all sessions**. login/register + the
  email endpoints are **rate-limited** (DB fixed-window, #80). Endpoints:
  `/api/auth/{register, login, logout, me, verify, resend-verification,
  forgot-password, reset-password}`. Sessions, not JWT; not Supabase/Auth.js.
- **Styling**: Tailwind CSS v4 (utility classes; brand accents as arbitrary
  values, e.g. `bg-[#D85A30]`).
- **Transactional email**: **Resend** via direct curl from PHP (`RESEND_API_KEY`;
  a console transport is used in dev when unset). Deliberately NOT Brevo (see
  CLAUDE.md). Powers verification (#61) + password reset (#62); single-use tokens
  in `email_tokens` (`verify` 24h / `reset` 1h). Production email is **live** —
  `addiapp.com` verified in Resend, sending from `no-reply@addiapp.com` (#65).
- **Deploy (#39, done)**: GitHub Actions on push to `main` builds the SPA, rsyncs
  it + the PHP `api/` over SSH, then `php migrate.php`. No process restart. Live
  at addiapp.com. Secrets in `~/api/config.php` (PHP array, outside the web root).

Everything in §2 is resolved. Remaining open items are product/scope (§10).

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
- **Mascot**: an **expression-driven SVG icon is built and live** — the **v3 "star
  character" (#210)**, which **superseded the v2 penguin (#96)**: one `Mascot`
  component with a `neutral | celebrating | idle` `expression` prop, a round golden
  face + posable chunky star-point limbs, big cartoony eyes, blush cheeks
  (`--color-mascot-blush`), look-down idle, crown cowlick, single flat body colour,
  `--color-mascot-*` tokens. An opt-in **`halo`** prop places it **half-out over the
  PlayCard top edge** (#211). Still SVG icon art, not final illustrated art. Full
  spec: CLAUDE.md + #210's body.
- **Color palette**: the placeholder warm coral (`#D85A30`) is **fully retired**. Live
  palette is **vivid v3** (#143) — three token roles per hue (vivid fill / ink-on-light /
  dark-on-fill) + tints; primary `#FB5231`, success `#1F9E3E`, accent `#1CB0F6`, warning
  `#C17F00`; **flat surfaces**, AA-verified (see CLAUDE.md for the text-on-vivid rule).
  **Flat "no shadows/borders" remains the rule** — with one scoped exception (the half-out
  mascot's halo + light mascot-only shadow, #210/#211) and one open proposal to revisit it
  (#213 "spit & polish": card drop-shadows + button polish — **not yet adopted**).

## 5. Core UX flow — "Play" mode (mascot-guided home)

**Status: all Play-mode screens are BUILT** (issues #29–#34, #69) and have since been
restyled (visual refresh v2 #91/#92/#94, vivid palette v3 #143). They share one mascot /
palette / spacing language. **The standalone Home screen was RETIRED (#191)** — `/` now
redirects to the Choice screen as the single Play landing. The flow:

1. **~~Home~~ — RETIRED (#191)** — the mascot-led landing + "Let's go" CTA is gone; `/`
   redirects to **Choice**. A mid-flight task is now surfaced by a **Resume banner on
   Choice** plus the header in-progress **timer chip** (#135), not a Home affordance.
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
   another task reusing the same win/time filters. (The old "Back to home" is gone —
   Home was retired, #191.)
6. **Empty state** (#32) — when selection returns nothing: mascot + "Nothing
   here right now". Primary action is "Add a task" when the backlog is empty, or
   "Pick a different win" when filters just matched nothing.

**Resume (#69)**: because Play-mode selection only offers *backlog* tasks, a
started-but-unfinished task would otherwise be stranded. Home surfaces the most
recently started in-progress task as a "Resume: <title>" link to
`/play/progress/:id`; when more than one is in progress, a small "N tasks in
progress" link points to the Dashboard. This is an extension of the original
four-screen flow.

### Shared PlayCard skeleton (#204 epic)

The four single-message Play screens (TaskPresented, InProgress, Completion, EmptyState)
are unified onto **one shared `PlayCard`** — a centred flat card with a fixed slot order
(`eyebrow → title → body? → hero? → context? → primary → secondary? → footer?`). **Phase 1
(#208, DONE)** built it + migrated Completion + EmptyState. **Phase 2 (#211, DONE)** migrated
TaskPresented + InProgress (bespoke card markup removed) and adopted the **half-out mascot**
placement across all four (mascot straddles the card's top edge with a thin theme-aware halo
+ a light mascot-only shadow; cards stay flat) — **revising** the epic's original "mascot
inside" plan. **The #204 epic is closed.** Settled slot semantics (#204): `eyebrow` =
celebratory/status framing; `secondary` shape-flexible (link row OR button pair);
TaskPresented's effort badge stays a colored badge (one deferred cleanup: Completion's
`title`/`eyebrow` re-slot to task-name-as-title was not applied in #211's placement-only
scope). Forms use the sibling **`FormCard`** (#206 — same surface system, no mascot; AddTask
/ EditTask / Settings). The **Choice** screen is deliberately NOT on PlayCard (its two-option
layout is structurally different).

### Task-selection algorithm (resolved — was §10's oldest open item)

Lives behind a swappable seam in `api/src/Tasks/Selection.php` (strategies take an
already-filtered candidate list + an injectable rng and return one task or null):

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

All numbers are final and live in **one file, `api/src/Points/PointsConfig.php`** —
tuning them never touches the calculation logic (`Points/Calculate.php`, pure
math) or the award orchestration (`Points/Award.php`, DB writes). Base points are
also surfaced to the UI via `GET /api/points` so the front end never hardcodes them.

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

### Release 1 — status (LIVE at addiapp.com)
- ✅ Custom auth (register/login/logout, bcrypt + DB-backed sessions) — #26,
  hardened against email-send failures (#67), login/register rate-limited (#80)
- ✅ Task CRUD, user-scoped (title, complexity, estimated time) — #27
- ✅ Points system as defined in §7 (all numbers finalized) — #28
- ✅ Play mode: Home → Choice → Task presented → Start → In-progress →
  Completion, plus Empty state and Resume — #29–#34, #69 (**Home later retired, #191**
  — `/` now redirects to Choice; see §5)
- ✅ Task-selection algorithm (weighted-random, swappable) — part of #31
- ✅ Dashboard: task list/management + inline edit + full edit page — #36
- ✅ Dashboard user points card — #37
- ✅ User points/stats page — #38
- ⬜ **Marketing / landing homepage** (#40) — the only remaining Release-1 item
  on the app itself; **not yet scoped**.
- ⬜ **Basic user guide / help content** (#41) — **not yet scoped**.
- ✅ Email verification (#61) + password reset (#62) — production email **LIVE** (#65).
- ✅ **Backend rewritten to PHP 8.2 + PDO** (Node unavailable on the plan) — #77.
- ✅ Deploy pipeline (GitHub Actions + rsync + `php migrate.php` over SSH) — #39.
- ⬜ Marketing / landing homepage (#40) and user guide (#41) — the only remaining
  Release-1 items, both **not yet scoped**.

### Explicitly deferred to later releases
- Multi-user competitive features: leaderboards, scoreboard
- Projects (grouping tasks), Teams, task sharing for bonus points
- Per-user task-selection preference + settings page (interface is ready)
- Real (illustrated) mascot art — the expression-driven SVG **icon** shipped and
  advanced through the v3 "star character" rebuild (#210, live; superseded the v2
  #96 icon); fully **illustrated** art remains the deferred pass
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

- [ ] **#40 marketing / landing homepage** — scope/content not defined.
- [ ] **#41 user guide / help content** — scope/content not defined.
- [ ] **Auth hardening beyond rate-limiting** — CAPTCHA (Cloudflare Turnstile) +
  edge protection (WAF/Bot Fight). Login/register rate-limiting is done (#80); the
  rest is #79.
- [ ] **Privacy policy / Terms of Service** pages (needed before public launch).
- [ ] Final color palette / brand direction — **vivid v3 is live (#143)** and current;
  only a "final/locked brand" sign-off remains (placeholder coral `#D85A30` retired).
- [ ] Real mascot art — **v3 "star character" is now LIVE (#210, superseded the v2 icon
  #96); half-out PlayCard placement shipped (#211).** Still SVG icon art (advanced, not closed).
- [ ] Flat-surface rule vs. depth — **#213 "spit & polish"** proposes card drop-shadows +
  button polish (would revise the flat "no shadows/borders" rule); triage / not adopted.
  (Resolved & removed: the "Home secondary-link set" question — Home was retired, #191.)

Resolved since the last sync: backend language (**PHP**, #77), hosting (**same
Basic Plus Reseller as wptips**), SSH availability (**yes**), deploy (**#39**),
production email (**#65, live**).

## 11. Change log — documentation syncs

- **2026-07-12** — folded in the merged work #25–#70 (schema, auth, task CRUD,
  points, Play mode, add-task, dashboard, points card, stats, resume), then email
  verification (#61) + password reset (#62), ahead of the first `develop → main`
  promotion (Release 1, v1.0.0).
- **2026-07-13** — the big pivot: the KnownHost plan can't run Node, so the
  backend was **rewritten from Node/Express/Drizzle to plain PHP 8.2 + PDO**
  (#77); the **deploy pipeline** (#39) and **production email** (#65) went live;
  login/register **rate-limiting** (#80) landed. Corrected the hosting note (same
  Basic Plus Reseller box as wptips.com). AddiApp is now **live at addiapp.com**.
  Where docs and code disagreed, code won.
- **2026-07-19** — currency sync (this doc had lagged since 2026-07-13; **CLAUDE.md
  stayed current in the interim and is the authoritative reference**). Folded into the
  spec: **Home retired (#191)** (`/`→Choice); **visual refresh v2** (#91/#92/#94 — design
  tokens + Header/Footer/AppLayout shell, all screens restyled flat, borders/shadows/
  gradients stripped); **vivid palette v3** (#143, coral `#D85A30` retired); **Settings**
  (#187 account + #200 email-change-re-verification); **task descriptions** (#184);
  **effort radiogroup** (#197); **shared PlayCard epic** (#204/#208/#211 — Phase 1 + Phase 2
  done, epic closed); **shared FormCard** (#206); **header timer chip + InProgressProvider**
  (#135); **A11Y cluster** (#126); the **resilience** (#101/#110/#112), **security** (#79
  Turnstile + #107 headers + #118/#120) and **ops-hardening** (#103/#105/#109/#122) batches —
  all shipped across releases v1.2.0–v1.6.0; in-repo **puppeteer e2e a11y harness** (#170).
  **Headline of the 1.7.0 pass:** the **mascot v3 "star character" rebuild** (#210 — superseded
  the #96 penguin; adds `--color-mascot-blush` + a `halo` prop; look-down idle) with its
  **half-out PlayCard placement** (#211, all four adopters) and the shared **FormCard** (#206) —
  all **now BUILT + live on develop**. Still open/filed: **#213 "spit & polish"** (revisit the
  flat "no shadows" rule) and the **EditTask desktop modal** (#218, split from #206). CLAUDE.md
  holds the authoritative detail.
