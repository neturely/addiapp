# AddiApp — Project Context

> Authoritative project reference — supersedes stale chat history. Originally a
> rebuild-planning draft (2026-07-11); synced 2026-07-12 for the merged work
> #25–#70, and re-synced 2026-07-13 for the **PHP backend rewrite (#77)**, the
> **deploy pipeline (#39)**, and **live production email (#65)**. Most core
> decisions are settled; open items live in the Open decisions log. Where this
> file and the code disagree, the code (on `develop`) wins — update this file.

## What this project is

AddiApp is a gamified personal task app. Core loop: a mascot-led home screen
guides the user to one task at a time (rather than a full list), and
completing tasks earns points with bonuses for speed and daily volume. A
separate "dashboard" surface gives a clean admin view (add/edit/list tasks)
for anyone who wants manual control instead of the guided flow.

This is a **full rebuild, not a migration**. The original Next.js/Supabase
codebase is fully discarded — nothing carries forward except the general task
concept (title/completed/timestamp) and font assets. No data-loss concern;
the old app was never in real use.

**Status: Release 1 is LIVE at https://addiapp.com** (React SPA + PHP API + MySQL).

## My background

- Full-stack developer, 17+ years in IT (Java, Spring Boot, Node.js, React, PHP, Docker)
- Based in Linköping, Sweden
- AddiApp is a project under the Neturely umbrella (web hosting and development company)
- Domain `addiapp.com` registered/proxied via Cloudflare
- Hosting: KnownHost **Basic Plus Reseller** — the SAME cPanel/CloudLinux/LiteSpeed
  account as wptips.com (sister Neturely project), NOT a separate shared plan.
  This plan does **not** offer Node.js app hosting (no CloudLinux Node.js
  Selector), which is why the backend is PHP (see Decisions).
- Dev environment: macOS + colima (Docker) + VSCode + Claude Code.

## Decisions already made — do not re-litigate

- Frontend: React (Vite) SPA — not Next.js. Static build served from the docroot.
- Backend: **plain PHP 8.2 + PDO** (`api/`) — no framework, no Composer runtime
  deps. NOT Node/Express (the KnownHost plan can't run Node) and not Next.js. The
  original Node/Express/Drizzle `server/` was fully rewritten in PHP (#77); the
  HTTP contract was preserved, so the client was untouched.
- Database: MySQL/MariaDB — not Postgres, not Supabase.
- DB access: **plain PDO**, parameterized queries. Schema is hand-written SQL in
  `api/migrations/`, applied by `api/migrate.php` (tracked in a `_migrations`
  table). No ORM (the Drizzle era ended with the PHP rewrite). Migration
  discipline (#103): **one logical change (ideally one statement) per file** +
  idempotent DDL (`CREATE TABLE/INDEX IF NOT EXISTS`) so a re-run/partial-failure
  can't wedge — the per-file tracker + auto-committing DDL means a multi-statement
  file that dies mid-way is left partially applied. **Engine caveat (#184):** dev
  is MySQL 8.0 but prod is MariaDB 10.11 — `ADD COLUMN IF NOT EXISTS` is
  **MariaDB-only** and errors on the dev DB. For a **single-statement** ALTER, use
  plain `ADD COLUMN` (no `IF NOT EXISTS`): the tracker runs it exactly once and one
  statement can't leave a partial state. `CREATE TABLE/INDEX IF NOT EXISTS` is fine
  (both engines support it).
- Auth: custom, self-rolled — **DB-backed server-side sessions** (opaque random
  token in an httpOnly `sid` cookie, 7-day TTL; the `sessions` row is the source
  of truth, so logout/expiry revoke access immediately) + **bcrypt** via PHP's
  `password_hash`/`password_verify`. Sessions, **not JWT**. Not Supabase Auth.
- Styling: Tailwind CSS v4 (utility classes, no config file; coral brand accents
  as arbitrary values like `bg-[#D85A30]`).
- Transactional email: **Resend** (direct curl from PHP; `RESEND_API_KEY`) for
  verification + password-reset. Deliberately NOT Brevo: wptips.com uses Brevo for
  its marketing/contacts/automation layer, which AddiApp doesn't need — AddiApp is
  pure transactional, exactly Resend's niche. Two intentional per-project choices,
  not an inconsistency. Production email is **live** — `addiapp.com` verified in
  Resend, sending from `no-reply@addiapp.com` (#61/#62/#65).
- Hosting: KnownHost Basic Plus Reseller — cPanel/CloudLinux/LiteSpeed. LiteSpeed
  serves the PHP backend directly (no process/Passenger to restart). **SSH is
  available.**
- Domain: `addiapp.com`, live, proxied through Cloudflare.
- GitHub: org `neturely`, repo `addiapp`.
- Deploy: **done (#39)** — GitHub Actions on push to `main` builds the SPA and
  rsyncs it (+ the PHP `api/`) over SSH. Ordering is **migrate-before-cutover**
  (#103): ship the ops script + migrations, run a **pre-deploy DB backup that
  gates the migrate** (`backup-db.sh --pre-deploy && migrate.php`), THEN rsync
  code + SPA — so a failed backup/migrate aborts before new code goes live. No
  restart. See docs/DEPLOY.md.
- Secrets: production config in `~/api/config.php` (a PHP array **outside** the
  web root, `chmod 600`, git-ignored, rsync-excluded) — NOT a `.env` (a PHP file
  isn't served as plaintext even if exposed; `.env` is).
- Old codebase/live site: fully disposable, no migration effort required.
- Design mood: bold, colorful, mascot-driven (Duolingo-style personality, not
  literal look) layered on Todoist/Linear-level clean UI chrome. Trello's
  structural idea (liked conceptually) is NOT literally adopted — home flow is
  single-task-at-a-time, not a board.
- Points visibility: shown up front (approximate) before task commitment —
  not hidden until completion. Deliberate: visibility is motivating.
- Release strategy: minimal Release 1 (now live), defer competitive/social
  features (leaderboards, teams, projects, sharing) to later phases.

## Points / gamification system (finalized, #28)

All numbers are FINAL and live in ONE file — `api/src/Points/PointsConfig.php`.
Tuning them never touches the pure math (`Points/Calculate.php`) or the award
orchestration (`Points/Award.php`). See PROJECT_SPEC §7 for the full formulas.

- Base points: Low = 2, Medium = 5, High = 10.
- Estimated time: entered manually at creation (minutes); not derived from complexity.
- Speed bonus (saturation-based, anti-gaming): scales with time saved, reaching
  the ceiling of **+100% of base** (`SPEED_BONUS_MAX_RATIO = 1.0`) at
  **≤50% of the estimate** (`SPEED_BONUS_SATURATION = 0.5`); 0 if on/over estimate.
- Daily multiplier: `min(1 + (n−1)·0.15, 2.0)` for the n-th completion of the day
  (`GROWTH = 0.15`, `CAP = 2.0`) → cap at the **8th** task/day; resets at midnight
  in `APP_TIMEZONE` (default **Europe/Stockholm**). Total = `round((base + speed) × mult)`.
- Idempotency: points awarded **once per task, ever** — enforced by a
  `UNIQUE(task_id)` on `points_log` plus a duplicate-key catch, so even a
  concurrent double-complete awards once (#74).
- Points are shown up front (approximate base, before commitment) — decided.

## Task-selection algorithm (Play mode, #31)

Behind a swappable seam in `api/src/Tasks/Selection.php`. The route
(`GET /api/tasks/next`) filters candidates (win-type → complexity: small =
{low, medium}, big = {medium, high}; time-available; backlog only; optional
`exclude` for re-roll); the strategy only picks one — no selection logic in the
controller.

- Default: **`weightedByAge`** — weighted random favouring older tasks
  (rank-based weights; oldest most likely, still random). Alternates
  `oldestFirst` / `uniformRandom` ship too.
- **"Focus on projects" mode (#238):** `GET /api/tasks/next?mode=projects` ignores
  win-type and calls **`Selection::focusProject`** — deterministic: group active-project
  backlog candidates (time-filter-respecting), pick the project with the **least remaining
  effort** (Σ `PointsConfig::BASE_POINTS`, closest to done), tie-break **oldest project**
  (`created_at`, then id), then the **oldest task** within it. Same `{ task }` shape.
- A future **per-user selection preference** is designed for (swap
  `Selection::strategies()[$name]`) but **not built** — no settings page yet.

## What's built (maps to PROJECT_SPEC §5/§6) — LIVE at addiapp.com

Backend endpoints (PHP, `api/src/Controllers/`); the client contract is identical
to the old Node API.

- **Auth (#26, #61, #62, #67, #79, #80)**: `/api/auth/{register,login,logout,me,verify,
  resend-verification,forgot-password,reset-password}`. DB-backed sessions, bcrypt.
  Email verification gates login; password reset revokes all sessions. register
  survives email-send failures (best-effort, #67) and is **non-enumerating** —
  an existing email gets the same 201 + neutral body as a new one, no insert, no
  re-sent email (#118); login/forgot/resend are neutral too. login/register + the
  email endpoints are rate-limited (#80). **Cloudflare Turnstile CAPTCHA** on register +
  forgot-password, verified server-side via `siteverify` (#79) — all-or-nothing on
  `turnstileSecret` (`config.php`) + `TURNSTILE_SITE_KEY` (build env); unset =
  disabled (dev default, fails closed if only the secret is set). Client pages:
  `/verify`, `/forgot-password`, `/reset`.
- **Task CRUD (#27, #184, #100)**: user-scoped `GET/POST/PATCH/DELETE /api/tasks` + `GET /api/tasks/next`.
  Tasks have an optional plain-text **`description`** (#184, `varchar(1000)` NULL, empty→NULL,
  line breaks kept via `whitespace-pre-wrap`): a textarea in the shared `TaskForm`, shown on the
  TaskPresented **and InProgress** cards, and an **expandable chevron row** on the dashboard table (chevron only when a
  description exists — a sibling button beside the click-to-edit title, expanding a colSpan `<tr>`).
  **Pagination (#100):** `GET /api/tasks` takes **opt-in** `limit` + `before` (keyset cursor on
  `id DESC`) — **absent `limit` = the legacy unbounded list**, so `fetchTasks()` / InProgressProvider
  are untouched; with `limit` it returns `{ tasks, nextCursor, counts? }` where `counts` (a per-status
  `GROUP BY`) rides **only the first page**. Bad `limit`/`before` → 400. Cross-user access is **404,
  not 403** (non-enumerating; locked by #129's test). Index `(user_id, status)` (migration 006) covers
  the keyset query (InnoDB appends the PK → no filesort).
- **Projects (#234, epic #233 — A of A/B/C/D)**: user-scoped `GET/POST/PATCH /api/projects`
  (`ProjectsController`). A **project** groups tasks: `projects` table (migration 007;
  `status enum('active','archived')`, archive = the terminal "completed" state — no
  archived-browsing view in v1) + a nullable **`tasks.project_id`** FK (migrations 008/009,
  `ON DELETE SET NULL` → deleting a project unassigns its tasks) + a `(user_id, project_id)`
  index (010). `GET /api/projects` lists **active** projects with **remaining + total** task
  counts (one grouped `LEFT JOIN`; "X of Y remaining", remaining = `status <> 'done'`);
  `POST` creates, `PATCH` edits name/description and/or status (Archive). User-scoped +
  **404-not-403** (non-enumerating, #129). `POST /api/tasks` gained an optional **`projectId`**
  (must be an **active** project the caller owns, else 400); `projectId` is on `mapTask`.
  Client: `lib/projects.ts`; the **Dashboard has a top-level `Tasks | Projects` toggle**
  (`?view=projects`, linkable) — Projects is a **self-contained `ProjectsView`** grid (cards
  with the count, a kebab Edit/Archive **disclosure** — NOT a `role=menu` widget — and Add
  task / Assign task footer actions). New/Edit project uses the shared **`Modal` (#218)** via
  `ProjectModal` + `ProjectForm` (its own small form, **not** `TaskForm`). **AddTask** reads
  `?project=ID`, resolves it against active projects, shows a read-only "Adding to <project>"
  line, and passes `projectId` to `createTask`.
  **B (#236) — Unassigned tab + assign flow:** `GET /api/tasks?unassigned=1` filters
  `project_id IS NULL` (any status — a different axis than the status tabs, covered by the
  `(user_id, project_id)` index); the first-page `counts` gained an **`unassigned`** key.
  `PATCH /api/tasks/{id}` accepts **`projectId`** (positive int → assign to an active owned
  project, else 400; **`null`** → unassign). Client: a Dashboard **"Unassigned" tab** (set apart
  with a divider), URL-driven via **`?tab=unassigned&project=ID`** — a project card's "Assign task"
  deep-links here: a **ride-along banner** assigns in one click, direct-landing opens a small
  **project-picker disclosure** (`AssignControl`). Assign is optimistic (row leaves the view,
  counts adjusted, restore on failure). New **`belongsToFilter()`** helper makes `restoreRow` +
  inline-edit drop **project-aware** (the unassigned axis is project-based, not status). `TaskCounts.unassigned`
  + `fetchTasksPage({unassigned})` + `assignTaskToProject(id, projectId|null)` in `lib/tasks`.
  **C (#238) — Play "Focus on projects":** the Choice screen (`/play`) gained a **third full-width
  option** ("Focus on projects", accent/Layers, "Auto-picked" chip; the two win-type options were
  renamed "Get small tasks done" / "Take on bigger issues") that navigates to `/play/task?mode=projects`
  (+ time; **no size**). `mode=projects` carries through the whole Play chain (TaskPresented → InProgress
  → Completion "Keep going") alongside `minutes`, mutually exclusive with `size`. Server pick =
  `Selection::focusProject` (see Task-selection algorithm above). `fetchNextTask({mode})` + `PlayMode` in `lib/tasks`.
  **Still pending in the epic:** #240 D (project-completion points).
- **Points (#28)**: `GET /api/points` (card) and `GET /api/points/stats` (lifetime + streak).
- **Play mode (#29–#34, #69, #191)**: Choice `/play` is the landing (`/` redirects
  to it — the standalone Home screen was retired in #191), Task `/play/task`,
  In-progress `/play/progress/:id`, Completion, Empty state. A mid-flight task is
  surfaced by a Resume banner on Choice **plus** the header timer chip.
- **Dashboard (#36, #178, #218, #100)**: `/dashboard` — table + inline edit,
  status filter tabs, sortable columns, per-row icon actions (Start/Resume=Play,
  Edit=Pencil, Delete=Trash; Save=Check / Cancel=X while editing — all
  `aria-label`led), undo-toast delete. **The `backlog` status DISPLAYS as "To do"**
  (filter tab, status badge, edit select) — presentation-only; the enum value stays
  `backlog`, so never string-match the label. Rows are a fixed `h-14` so inline-edit
  doesn't change row height. **Edit (#218):** the Pencil opens a **desktop modal
  over the list** (`EditTaskModal` on the `Modal` primitive, reusing `TaskForm`);
  the full page `/tasks/:id/edit` still backs deep links / refresh / **mobile** —
  the trigger is CSS-responsive (`<button>` opens the modal at `sm+`, `<a>` routes
  to the page below `sm`; only one is in the a11y tree per breakpoint). Mobile modal
  deferred pending #98. **Pagination (#100):** the list loads **25 at a time**
  (`fetchTasksPage`, keyset "Load more"); **filtering is server-side** (a tab switch
  is a fresh first-page query), the **tab counts + header total come from the server
  `counts`** (not the loaded rows), and inline-edit/delete/undo mutate the loaded set
  + adjust the cached counts client-side (a status change off the active filter drops
  the row). Column sort applies over the **loaded** rows (default order == server
  order, so exact until a non-default sort on a partially-loaded list).
- **Add task (#35)**: `/tasks/new`. **Points card (#37)**. **Stats page (#38)**: `/stats`.
- **Settings (#187, #200)**: `/settings` (gear nav) — account management. `AccountController`:
  `PATCH /api/account` (display name; shared `AuthController::displayName` validator, ≤50 chars,
  empty→NULL, now also enforced on register) + `POST /api/account/password` (needs current
  password, keeps this session and revokes the rest via `Sessions::deleteUserSessionsExcept`).
  **Email change (#200)** is a re-verification flow: a `pending_email` column (migration 004) + an
  `email_change` `EmailTokens` type (enum extended, migration 005); `POST /api/account/email` stores
  the pending address (non-enumerating, rate-limited) and Resends a confirm link to it; the
  UNauthenticated `POST /api/auth/confirm-email-change` (client `/confirm-email-change`) swaps it in
  and revokes ALL sessions (login identifier changed → re-sign-in with the new address).
- **Deploy (#39)** + **production email (#65)** done.

NOT yet built: marketing homepage (#40, unscoped), user guide (#41, unscoped).
Auth hardening beyond rate-limiting (CAPTCHA/edge) is #79.

## Repo structure

Monorepo (npm workspaces for the client only; the PHP `api/` isn't an npm package).

```
addiapp/
├── docker-compose.yml            # local MySQL 8.0 for development
├── scripts/db.sh                 # db:up/down/reset helper (macOS vs Linux compose)
├── .github/workflows/deploy.yml  # build SPA + rsync + migrate over SSH (#39)
├── docs/DEPLOY.md                # pipeline, secrets, one-time server setup
├── client/                       # React 19 + Vite SPA (TypeScript)
│   └── src/                      #   pages/, components/, auth/, lib/, router.tsx
│       └── public/.htaccess      #   SPA routing (ships in the build)
├── api/                          # PHP 8.2 + PDO backend (replaces the old server/)
│   ├── public/index.php          #   front controller (router + bootstrap)
│   ├── public/.htaccess          #   rewrite → index.php
│   ├── router.php                #   dev router for `php -S`
│   ├── migrate.php               #   applies migrations/*.sql (tracked in _migrations)
│   ├── migrations/*.sql          #   schema
│   ├── config.example.php        #   copy to config.php (prod, outside web root)
│   └── src/
│       ├── Config, Db            #   env/config + PDO
│       ├── Http/                 #   Request, Response, Router
│       ├── Auth/                 #   Passwords (bcrypt), Sessions, EmailTokens
│       ├── Email/                #   Resend (curl) + console transports, templates
│       ├── Points/               #   PointsConfig, Calculate, Award
│       ├── Tasks/Selection.php   #   swappable weighted-random selection
│       ├── RateLimit.php         #   DB fixed-window limiter
│       └── Controllers/          #   Auth, Tasks, Points, Health
├── public/fonts/                 # Nunito web fonts (kept from original)
├── CLAUDE.md · PROJECT_SPEC.md · README.md
```

## Local dev environment

- Docker Compose (macOS + colima) — a **MySQL 8.0 container only**; the app runs
  on the host. Requires PHP 8.2+ on the host.
- First-time setup:
  1. `cp .env.example .env` (docker MySQL creds)
  2. `npm install`
  3. `npm run db:up` — MySQL 8.0 on `localhost:3306` (data in the `db_data` volume)
  4. `npm run db:migrate` — runs `php api/migrate.php`
  5. `npm run dev` — client on http://localhost:5173, PHP API on
     http://127.0.0.1:3001 (Vite proxies `/api`)
- No local `api/config.php` is needed — the built-in defaults point at the docker
  MySQL. With no `RESEND_API_KEY`, emails use the console transport (links logged
  to the API output).
- Changing the schema: add a numbered `.sql` to `api/migrations/`, then
  `npm run db:migrate`. Reset with `npm run db:reset`.
- **macOS + colima gotcha:** if `docker` reports "command not found" though colima
  is installed, the Homebrew `docker` CLI isn't linked. Fix once:
  `ln -sf "$(brew --prefix docker)/bin/docker" /opt/homebrew/bin/docker` then `colima start`.

## Screens (built)

All Play-mode and dashboard screens are implemented and live (#29–#38, #69). The
only screens not built are the marketing/landing homepage (#40) and user
guide/help content (#41) — both unscoped.

App shell (#92): authenticated routes render inside `AppLayout` (Header → Outlet
→ Footer). The Header nav is icon-only **Play + Dashboard + Settings (gear, #187)** —
the initials **avatar is the Stats link** (avatar-as-Stats is a deliberate #92
decision, not a missing nav item), and logout lives in the Footer. Add-task is a
Header CTA button. A live **in-progress timer chip** (#135) sits left of the Play
icon when a task is in progress — `InProgressProvider` (wrapping `AppLayout`)
tracks the most-recently-started in-progress task (fetch on mount + route change,
no polling); `TimerChip` ticks client-side off `startedAt` and links to
`/play/progress/:id`.

Shared **`PlayCard`** (`components/PlayCard.tsx`, #204 epic / #208 Phase 1 / #211
Phase 2; supersedes the old `CardScreen`): the canonical Play-moment card — a
centred flat white rounded card rendering a fixed slot order (`eyebrow? →
title/body? → hero? → context? → primary → secondary? → footer?`, plus a
`decoration` slot that spills past the card edge, e.g. Completion's corner
confetti). **All four** single-message Play screens now ride it: **Completion +
EmptyState** (Phase 1, #208) and **TaskPresented + InProgress** (Phase 2, #211 —
their bespoke `<main>`/white-card markup was removed). **The #204 epic is CLOSED.**
**Mascot placement (LIVE, #210/#211):** the mascot is **half-out, straddling the
card's top edge** (half on the cream page, half over the card), with a thin
theme-aware sticker **halo** + a light drop-shadow **on the mascot only** (the card
stays flat). It's an absolutely-positioned slot (`pointer-events-none`) over the top
edge, card top-padding clearing its lower half; adopters pass the mascot with `halo`
+ a sizing class (`<Mascot halo className="h-24 w-24" />`). Confetti and the
celebrating arms-up pose coexist with it without collision. **Slot semantics (#204):**
`eyebrow` = the celebratory/status framing (the rotating working label, etc.);
`secondary` is **shape-flexible** (an icon+text link row OR a button pair, e.g.
EmptyState's Retry/Add); TaskPresented's effort badge **stays a colored badge** (not
flattened into muted eyebrow text). **Remaining #204 cleanup (deferred):** Completion
still uses `title="Nice work!"` + `body`=task name — the `eyebrow="NICE WORK"` +
`title`=task-name re-slot was NOT applied in #211 (placement-only scope); pick it up
in a later polish pass. Reach for `PlayCard` for any single-message Play screen
rather than re-rolling the shell. Responsive note: the app's only breakpoint is
**`sm`** (640px) — no `md`/`lg`; the Choice screen (deliberately NOT on `PlayCard`)
flanks the mascot side-by-side at `sm+` and stacks it above the two win cards below `sm`.

Shared **`FormCard`** (`components/FormCard.tsx`, #206): the **utility/admin
counterpart** to `PlayCard` — the titled flat surface box (`rounded-2xl bg-surface
p-6` + heading) that the form screens each hand-rolled, with **no mascot and no
celebratory framing** (forms aren't part of the game loop). **AddTask** + **EditTask**
each wrap one (centred `h1`); **Settings** stacks three sections (left-aligned `h2`).
Page-level layout stays per screen; FormCard only unifies the card + heading. The
**EditTask desktop-modal** half of #206 (over the dashboard, `sm+`, with focus
trap / return-focus / Escape / `role="dialog"`) was split to **#218** — filed, not
built; mobile stays the full page pending #98.

Mascot — **currently LIVE = v3 "star character" (#210; supersedes the v2 penguin
#96 entirely)** — one `Mascot` component (`client/src/components/Mascot.tsx`) with
an `expression` prop (`neutral | celebrating | idle`) **plus an opt-in `halo` prop**.
A **round golden face** (`--color-mascot-body #ffc800`) with **four chunky rounded
star-point limbs** (2 arms upper, 2 legs lower) that **pose per expression** (a
second expression channel on top of the face), **big cartoony eyes** (cream whites +
dark pupils + catch-light), **soft blush cheeks**, a low coral smile, and a **front
cowlick** on the crown. Same `expression`-swap mechanism (no per-state redraw);
**idle = "look-down"** (eyes open, pupils low — attentive). Keeps the
single-flat-body-colour rule + `--color-mascot-*` tokens; **`--color-mascot-blush
#ff9a7a`** was added and the pupil deepened to `#4a3208`. The **`halo`** prop draws a
thin **theme-aware sticker outline** (surface-coloured, via a stacked `drop-shadow`
filter) + a light lift shadow on the mascot only — for the half-out PlayCard
placement (see above); default off, so any non-card placement is unchanged. Still the
**SVG ICON art** pass — advances but does NOT close the "real mascot art" open
decision (illustrated art is a later pass). **Timer-chip note (was flagged in #210):**
the header **timer chip** (#135) uses a **pulse dot, not the mascot**, so the feared
"star limbs melt at ~20px" face-only-crop companion asset is **NOT needed** — no
current usage renders the mascot that small.

Color palette — **vivid v3** (#143; single source `client/src/index.css`, flat,
no shadows/borders, AA-verified). Each hue has THREE roles — never one token doing
double duty:
- `--color-{h}` = **vivid FILL** (`bg-{h}`): primary `#FB5231`, success `#1F9E3E`,
  accent `#1CB0F6`, warning `#C17F00`. (success deepened from `#3ECF4C` in #174,
  warning from `#FFC800` in #176 — both so large/bold white text clears 3:1 on the
  fill, like primary's `#FF5A36`→`#FB5231` tune. `accent` is NOT tuned — it still
  fails white, stays dark-on-fill only. Solid-fill uses: the dashboard banner, the
  AddTask effort picker, and the InProgress meter bars.)
- `--color-{h}-ink` = **text on LIGHT** (`text-{h}-ink`, colored text/badges on
  cream/white): primary `#C43A0C`, success `#0B7C63`, accent `#6E3FD6`, warning
  `#8A5A00`. (These are the old v2 values — they were already AA as text.)
- `--color-on-{h}` = **dark text ON the fill** (`text-on-{h}`): primary `#3D1200`,
  success `#04240B` (deepened #174), warning `#2E2000` (deepened #176) — the last two
  deepened alongside their fills so the small on-fill caption/label still clears 4.5:1.
- `--color-{h}-tint` = soft tint for low-emphasis badges (`bg-{h}-tint` + `text-{h}-ink`).

Plus `muted #5B6270`, cream `page #F6F1EA`, `surface #FFFFFF`, and the `--color-mascot-*`
set (separate). Old coral `#D85A30` fully retired; the v2 muted fills are gone as fills.

**⚠ Flat-surface rule — STILL the rule, with one scoped exception and one open proposal.**
The UI is deliberately **FLAT — no shadows/borders**, colour separation only (established
across #91/#92/#94/#143; the palette leans on this). Two qualifications to track:
- **Scoped exception (mascot only, #210/#211):** the half-out mascot on PlayCard carries a
  thin halo + a **light drop-shadow on the mascot itself** — the *cards/surfaces stay flat*.
- **Open proposal — #213 "spit & polish" (NOT adopted):** a filed *candidate/triage* issue to
  revisit the flat rule by adding **super-light card drop-shadows** + button/UI polish. Read
  #213's body for the actual (still-being-triaged) scope. **The flat rule remains authoritative
  until a #213 batch actually ships** — do NOT add card shadows outside that issue. If/when a
  #213 batch lands, update THIS section (and PROJECT_SPEC §4) to match what shipped.

**Text-on-vivid rule (do not violate):** dark on-fill text (`text-on-{h}`) by default;
**white is allowed on the TUNED fills — `--color-primary`, `--color-success`,
`--color-warning` — only for large/bold text** (≥24px, or ≥19px bold — WCAG's 3:1
large-text tier; white on `#FB5231` = 3.31, on `#1F9E3E` = 3.49, on `#C17F00` = 3.33).
Those three fills were deepened (#143/#174/#176) specifically so white clears 3:1;
**`--color-accent` was NOT tuned — never put white on accent.** Applied to: the
PointsCard/Stats large stat numbers, the dashboard banner (#174), the AddTask effort-tile
labels (#176, `text-xl` bold), AND **all primary CTA buttons** — standardized to `text-xl`
(20px) `font-bold text-white` so they legitimately clear 3:1 (energetic look; dark-on-primary
read muddy). This includes the compact utility buttons — Header "Add task" and Dashboard
inline "Save" ARE primary CTAs and follow the same standardization. Everything else stays
dark on-fill: small labels/captions, badges, the filter/time pills, and the initials avatar
(small on-fill text needs 4.5:1, which is why `text-on-{h}` was deepened for the tuned hues).
Emphasis tiers: solid vivid + on-fill = high; tint + ink = low.

## Coding standards

- **Client**: TypeScript, React functional components + hooks (no classes).
  **All** API calls go through the single `apiRequest` wrapper (`client/src/lib/api.ts`)
  — `tasks.ts`/`points.ts` delegate to it, so every call throws a status-preserving
  `ApiError` (#101). No raw `fetch` in feature code. `apiRequest` also handles session
  expiry globally: a 401 on any non-`/auth/*` path fires `notifyUnauthorized()`
  (`lib/authSignal.ts`) → `AuthProvider` clears the user and `ProtectedRoute` redirects
  to `/login` with a muted note. `/auth/*` 401s stay local form errors (opt out elsewhere
  with `skipUnauthorizedHandler`).
- **Toasts (#176)**: app-wide transient notices go through the `ToastProvider` (`client/src/toast/`,
  mounted once in `AppLayout`) via `useToast().showToast({ message, icon, tone, action, duration })`.
  One toast at a time, colored icon badge (tone → badge fill), optional inline action, auto-dismiss
  (pauses on hover/focus), `role="status"`. It lives above the routes so a toast survives the
  navigation that raised it (e.g. AddTask fires one, then returns to the origin route). Prefer it
  over a bespoke per-page toast. The Dashboard undo-delete toast predates it and stays bespoke for
  now (its deferred-commit/undo semantics are page-specific) — a candidate for later migration.
- **Accessibility conventions (#126)**: standalone error messages use `role="alert"`;
  loading indicators and the undo toast use `role="status"` (toast also
  `aria-live="polite"` + `aria-atomic`, and pauses its auto-dismiss on hover/focus).
  Route changes move focus to `#main-content` via `RouteFocus` in `AppLayout` (which
  also hosts the skip link); an in-place screen (e.g. `Completion`) focuses its own
  heading. Segmented pill pickers use the `radiogroup` pattern (roving tabindex + arrow
  keys + `aria-checked`); icon/text-only controls get `aria-label`s. **Dialogs go
  through the shared `Modal` primitive (`components/Modal.tsx`, #218)** — `role="dialog"`
  + `aria-modal` + `aria-labelledby`, a focus trap (Tab/Shift+Tab cycle), initial focus
  into the panel, Escape + backdrop-click to close, body-scroll lock, and return-focus
  to the opener. Reach for it for any modal rather than re-rolling the a11y wiring (the
  EditTaskModal is its first adopter). **No native
  `title=` tooltips** (removed sitewide in #181 — they render an ugly OS box for mouse
  users and duplicate the `aria-label`); label with `aria-label` only. Any CSS motion
  accent (e.g. the timer chip's `animate-pulse-dot`, the Completion confetti) must be
  disabled under `prefers-reduced-motion` in `index.css`. Don't add ARIA
  without verifying the SR/keyboard interaction it produces — use the
  `client/e2e/` harness (`npm run e2e:a11y -w client`, #170): puppeteer-core drives
  the real app in system Chrome and asserts focus/keyboard/ARIA behavior. It's the
  in-repo tool for live-verifying any client interaction; needs the dev stack up
  (not in CI). See `client/e2e/README.md`.
- **Backend (PHP 8.2)**: plain PHP + PDO, no framework, no Composer runtime deps.
  Thin controllers; logic in modules (`Points/`, `Tasks/Selection.php`, `Auth/`).
  PDO **parameterized** queries only — never string-concatenate SQL. PSR-4-ish
  autoloader (`App\` → `api/src/`). Input validated server-side; the server is
  authoritative (the client mirrors rules for UX). Log via `App\Log`
  (`error`/`warn`/`info`, #122) — one structured JSON line to `error_log` with
  request context; don't add ad-hoc `error_log('[addiapp-…] …')` strings. (The
  dev `ConsoleTransport` email dump is not error logging and stays raw.)
- **Backend tests (#124, #128, #129)**: **PHPUnit** at the repo root
  (`composer.json`/`phpunit.xml`/`tests/`, `Tests\` PSR-4, `vendor/` git-ignored +
  never rsynced — upholds no-runtime-deps). Two suites: **`tests/Unit`** (pure —
  points math, Selection, Passwords, Turnstile, Log) and **`tests/Db`** (extends
  `DbTestCase`: each test runs in a transaction rolled back in tearDown, so rows
  never leak). **DB tests need a throwaway `addiapp_test` schema** via `DATABASE_URL`
  — they **skip cleanly when it's unset** (never touch dev/prod). Set it up once:
  create the DB + grant to the `addiapp` user, `DATABASE_URL=mysql://addiapp:addiapp@127.0.0.1:3306/addiapp_test php api/migrate.php`,
  then run `DATABASE_URL=… ./vendor/bin/phpunit`. Request-level integration tests
  build a `Request` (with a `sid` cookie) and dispatch through a `Router` wired with
  the routes, reading `http_response_code()` under output buffering (see
  `tests/Db/TaskAccessTest.php`). **CI (`ci.yml`) runs the backend suite as a gate on
  PRs into `main` only** (against MariaDB 10.11) — NOT on develop pushes (small issue
  PRs shouldn't wait; the develop→main promotion PR is the real gate). Coverage tiers
  are deliberately bounded: no exhaustive endpoint/UI-snapshot layer (Tier 4, not done).
- Secrets: production `api/config.php` (PHP array, outside the web root, `600`,
  git-ignored). Never a committed/web-served `.env`.
- Security headers (#107): set at the **origin, in-repo** (not Cloudflare) on both
  surfaces — SPA in `client/public/.htaccess` (top-level `Header always set`), API
  via early `header()` in `api/public/index.php` (before the OPTIONS short-circuit).
  HSTS/nosniff/XFO/`frame-ancestors 'none'`/Referrer-Policy. Don't move these to the
  edge (origin defense-in-depth is the point); don't add a content CSP (`script-src`)
  without a dedicated nonce/hash pass.

## Deployment (done — #39)

- GitHub Actions (`.github/workflows/deploy.yml`) on push to `main`: build the
  SPA, `rsync --delete` `client/dist` → `public_html` and `api/` → `~/api`
  (keeping `config.php`, `.well-known`, `cgi-bin`, the `api` symlink), then
  `ssh … php ~/api/migrate.php`. **No process to restart** (PHP).
- Routing: `public_html/api` is a **symlink** to `~/api/public`, so
  `addiapp.com/api/*` hits the PHP front controller; the SPA `.htaccess` handles
  client-side routing and skips `/api`.
- Secrets on the server: `~/api/config.php` (DB creds, `RESEND_API_KEY`, `appUrl`,
  `emailFrom`, `isProd`). GitHub secrets: `DEPLOY_SSH_{HOST,USER,PORT,KEY}`.
- **DB backups (OPS-1)**: nightly `mysqldump` cron (`scripts/backup-db.sh`) →
  gzipped/timestamped dumps in `~/backups/db/`, ~14-day rotation, read-only
  `addiapp_bak` user. App-level — JetBackup doesn't expose DB restore points on
  this account. `~/backups/db/` is the handoff for an external NAS pull (separate
  repo; not built here). Cron install is a documented on-box step, not deployed.
- Full details + one-time server setup + backups: **docs/DEPLOY.md**.

## How to help me

- Assume strong technical knowledge — skip basic explanations unless asked
- Ask, don't assume — if intent/architecture/requirements are unclear, ask
  before writing code
- Lead with the most practical solution first; call out KnownHost cPanel/PHP/
  LiteSpeed constraints when relevant
- Actively suggest better/longer-lasting solutions, but match complexity to the
  problem — this is a personal project, don't over-engineer
- Keep responses focused

## Never do these things

- Never suggest Node.js/Express/Next.js or any server that needs a persistent
  Node process — this plan runs PHP under LiteSpeed only.
- Never suggest Postgres or Supabase — MySQL/MariaDB only, self-hosted auth.
- Never suggest Auth.js/NextAuth — custom auth only.
- Never switch auth to JWT or a client-stored token — DB-backed sessions (opaque
  httpOnly `sid` cookie) by decision, so logout/expiry revoke immediately.
- Never suggest hiding points until task completion — decided to show them up front.
- Never "fix" AddiApp to use Brevo for consistency with wptips.com — AddiApp uses
  Resend by deliberate choice; different providers for different needs.
- **Never reference wptips.com's private editorial identity (the "Elise Porter" /
  `elise@` persona) anywhere in AddiApp** — separate projects, no shared identity.
  (It leaked once into a prod email `From`; scrubbed. Don't copy it from wptips
  context.)
- Never put production secrets in a committed or web-served `.env` — use
  `api/config.php` (PHP array, outside the web root, `600`).
- Never inline task-selection logic into the controller — it lives behind
  `api/src/Tasks/Selection.php` so a per-user preference stays a one-line swap.
- Never hardcode points numbers outside `api/src/Points/PointsConfig.php` — the
  single source; the client reads base points from `GET /api/points`.
- Never reintroduce the old Next.js/Supabase codebase without an explicit decision.

## Open decisions log

Genuinely still open:

- [ ] Marketing / landing homepage scope (#40)
- [ ] User guide / help content scope (#41)
- [ ] Auth hardening — edge protection only (#79 rate-limiting + Turnstile CAPTCHA
  are done; Cloudflare edge config — Bot Fight Mode, WAF on `/api/auth/*`, managed
  DDoS — tracked as a separate dashboard-only issue)
- [ ] Privacy policy / Terms of Service pages
- [ ] Final color palette / brand direction — **vivid v3 is live and treated as current
  (#143)**; only a "final/locked brand" sign-off remains open (placeholder warm coral
  `#D85A30` is fully retired).
- [ ] Real mascot art — the **v3 "star character" is now LIVE (#210, superseding the v2 icon
  #96); the half-out PlayCard placement shipped (#211).** Still SVG icon art, so this is
  *advanced, not closed* — illustrated art remains a later pass.
- [ ] Flat-surface rule vs. depth — **#213 "spit & polish"** proposes super-light card
  drop-shadows + button polish, which would revise the long-standing flat "no shadows/borders"
  rule; **triage / not adopted** (the flat rule holds until it ships). The mascot half-out
  halo + light mascot-only shadow (#210/#211) is a scoped exception already live. **Open thread
  to test under #213:** how a card drop-shadow reads against the mascot's own drop-shadow at the
  half-out overlap.

Resolved (kept for reference):

- [x] Backend language — **PHP 8.2 + PDO** (Node isn't available on the plan; #77)
- [x] Hosting — **same KnownHost Basic Plus Reseller box as wptips** (not a separate plan)
- [x] SSH availability — **yes**; deploy is Actions + rsync + SSH migrate (#39)
- [x] Production email readiness — **domain verified, live** (#65)
- [x] Auth model — DB-backed sessions + bcrypt (not JWT)
- [x] Points formulas + task-selection algorithm — finalized
- [x] Play/dashboard designs — built
- [x] Monorepo (client workspace) — kept
- [x] Home screen — **retired (#191)**; `/` redirects to Choice as the single Play
  landing (resume via the Choice banner + header chip), reversing the #29/#69 Home
  + resume-from-home decisions
