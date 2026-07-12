# AddiApp — Project Context

> Authoritative project reference — supersedes stale chat history. Originally a
> rebuild-planning draft (2026-07-11); synced 2026-07-12 to fold in the merged
> work #25–#70 (see "What's built" below). Most core decisions are now settled;
> remaining open items live in the Open decisions log. Where this file and the
> code disagree, the code (on `develop`) wins — update this file to match.

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

## My background

*(Carried over from the wptips.com project on the assumption this is the same
person/org — confirm or correct.)*

- Full-stack developer, 17+ years in IT (Java, Spring Boot, Node.js, React, PHP, Docker)
- Based in Linköping, Sweden
- AddiApp is a project under the Neturely umbrella (web hosting and development company)
- Domain `addiapp.com` registered/proxied via Cloudflare
- Hosting: KnownHost **shared hosting** (cPanel/CloudLinux/LiteSpeed) — note this
  differs from wptips.com's KnownHost *Reseller* plan; confirm whether AddiApp
  sits on the same account or a separate shared plan
- Dev environment: presumably Mac/WSL2 Ubuntu, VSCode, Claude Code — **TBD, confirm**

## Decisions already made — do not re-litigate

- Platform: React (Vite) SPA + Node.js/Express API — not Next.js. SSR/App
  Router doesn't fit KnownHost shared hosting + FTP deploy well.
- Database: MySQL/MariaDB — not Postgres, not Supabase. Not available on
  shared cPanel plans.
- DB access: **Drizzle ORM** (+ `mysql2` driver) — decided. Schema in
  `server/src/db/schema.ts`; generated SQL migrations in `server/drizzle/`.
- Auth: custom, self-rolled — **DB-backed server-side sessions** (opaque random
  token in an httpOnly `sid` cookie, 7-day TTL; the `sessions` row is the source
  of truth, so logout/expiry revoke access immediately) + **bcryptjs** password
  hashing (pure-JS, no native addon to compile on shared hosting). Sessions,
  **not JWT**. Not Supabase Auth, not Auth.js/NextAuth.
- Styling: Tailwind CSS v4 (utility classes, no config file; coral brand accents
  as arbitrary values like `bg-[#D85A30]`).
- Transactional email: **Resend** (TypeScript SDK, `RESEND_API_KEY`) for the
  verification + password-reset emails. Deliberately NOT Brevo: wptips.com uses
  Brevo for its marketing/contacts/list/automation layer, which AddiApp doesn't
  need — AddiApp is pure transactional, which is exactly Resend's niche. Two
  intentional per-project choices for different needs, not an inconsistency to
  reconcile. (Email verification #61 and password reset #62 are built and merged;
  production still needs Resend domain verification for addiapp.com — #65.)
- Hosting: KnownHost shared hosting — cPanel, CloudLinux, LiteSpeed, Node.js
  Selector (Passenger) for the Express backend; static build served directly
  for the frontend.
- Domain: `addiapp.com`, live, proxied through Cloudflare.
- GitHub: org `neturely`, repo `addiapp`.
- Deploy: GitHub Actions, FTP-based (existing `FTP-Deploy-Action` workflow is
  stale/broken — targets an unrelated static-site branch, no build step —
  will be replaced, not patched).
- Old codebase/live site: fully disposable, no migration effort required.
- Design mood: bold, colorful, mascot-driven (Duolingo-style personality, not
  literal look) layered on Todoist/Linear-level clean UI chrome. Trello's
  structural idea (liked conceptually) is NOT literally adopted — home flow is
  single-task-at-a-time, not a board.
- Points visibility: shown up front (approximate) before task commitment —
  not hidden until completion. Deliberate: visibility is motivating.
- Release strategy: build a minimal Release 1, defer competitive/social
  features (leaderboards, teams, projects, sharing) to later phases.

## Points / gamification system (finalized, #28)

All numbers are FINAL and live in ONE file — `server/src/points/config.ts`.
Tuning them never touches the pure math (`points/calculate.ts`) or the award
orchestration (`points/award.ts`). See PROJECT_SPEC §7 for the full formulas.

- Base points: Low = 2, Medium = 5, High = 10.
- Estimated time: entered manually at creation (minutes); not derived from
  complexity.
- Speed bonus (saturation-based, anti-gaming): scales with time saved, reaching
  the ceiling of **+100% of base** (`SPEED_BONUS_MAX_RATIO = 1.0`) at
  **≤50% of the estimate** (`SPEED_BONUS_SATURATION = 0.5`); 0 if on/over
  estimate. No extra beyond saturation.
- Daily multiplier: `min(1 + (n−1)·0.15, 2.0)` for the n-th completion of the
  day (`GROWTH = 0.15`, `CAP = 2.0`) → cap reached at the **8th** task/day;
  resets at midnight in `APP_TIMEZONE` (default **Europe/Stockholm**). Shown live
  as the next task's multiplier. Total = `round((base + speedBonus) × multiplier)`.
- Idempotency: points are awarded **once per task, ever** (first completion) —
  reopening + re-completing does NOT re-award (the `points_log` ledger is checked
  by `task_id`).
- Points are shown up front (approximate base, before commitment) — decided.

## Task-selection algorithm (Play mode, #31)

Behind a swappable interface in `server/src/tasks/selection.ts`
(`SelectionStrategy = (candidates, rng?) => Task | null`). The route
(`GET /api/tasks/next`) filters candidates (win-type → complexity: small =
{low, medium}, big = {medium, high}; time-available; backlog only; optional
`exclude` for re-roll); the strategy only picks one — no selection logic in the
route handler.

- Default: **`weightedByAge`** — weighted random favouring older tasks
  (rank-based weights; oldest most likely, still random) for the "keep momentum"
  feel. Alternates `oldestFirst` / `uniformRandom` ship too.
- A future **per-user selection preference** is designed for (swap
  `strategies[user.preference]`) but **not built** — no settings page exists yet.

## What's built (maps to PROJECT_SPEC §5/§6)

Merged to `develop` (#25–#38, #61, #62, #69). Quick orientation for a fresh session:

- **Auth (#26, #61, #62)**: register / login / logout / `me`, DB-backed sessions,
  bcryptjs. **Email verification** — register creates an unverified account and
  emails a link (`/api/auth/verify`, `/resend-verification`); login is blocked
  until verified. **Password reset** — `/api/auth/forgot-password` +
  `/reset-password` (single-use token, bcrypt, revokes all sessions). Client
  pages: `/verify`, `/forgot-password`, `/reset`. Email transport +
  single-use tokens in `server/src/email/` + `email_tokens`.
- **Task CRUD (#27)**: user-scoped `GET/POST/PATCH/DELETE /api/tasks`, plus
  `GET /api/tasks/next` (selection).
- **Points (#28)**: `GET /api/points` (lean, for the card) and
  `GET /api/points/stats` (lifetime + streak, for the stats page).
- **Play mode (#29–#34, #69)**: Home `/`, Choice `/play`, Task `/play/task`,
  In-progress `/play/progress/:id`, Completion, Empty state, Resume-from-home.
- **Dashboard (#36)**: `/dashboard` — table + inline edit (title/complexity/est/
  status), full edit page `/tasks/:id/edit` (shared `TaskForm` with Add), status
  filter tabs, per-row Start/Resume/Edit/Delete, undo-toast delete.
- **Add task (#35)**: `/tasks/new`. **Points card (#37)** on the dashboard.
  **Stats page (#38)**: `/stats`.

NOT yet on `develop`: deploy pipeline (#39), marketing homepage (#40, unscoped),
user guide (#41, unscoped).

## Repo structure

Monorepo (npm workspaces) — **decided**. Client and server in one repo.

```
addiapp/
├── docker-compose.yml            # local MySQL 8.0 for development
├── scripts/db.sh                 # db:up/down/reset helper (macOS vs Linux compose)
├── .github/workflows/            # (deploy pipeline rewrite is issue #39)
├── client/                       # React 19 + Vite SPA (TypeScript)
│   └── src/
│       ├── pages/                # Home, Login, Register, Verify, ForgotPassword,
│       │                         #   ResetPassword, Choice, TaskPresented,
│       │                         #   InProgress, AddTask, EditTask, Dashboard,
│       │                         #   Stats, NotFound
│       ├── components/           # Mascot, EmptyState, Completion, PointsCard,
│       │                         #   TaskForm, ProtectedRoute
│       ├── auth/                 # AuthProvider, authContext, useAuth
│       ├── lib/                  # api.ts + apiError.ts (apiRequest wrapper),
│       │                         #   tasks.ts, points.ts (raw-fetch clients)
│       └── router.tsx
├── server/                       # Node.js + Express API (TypeScript)
│   ├── drizzle/                  # generated SQL migrations (0000–0002)
│   └── src/
│       ├── db/                   # Drizzle schema, connection, migrator
│       ├── auth/                 # passwords (bcryptjs), sessions, emailTokens
│       ├── email/                # Resend + console transport, templates (#61/#62)
│       ├── points/              # config.ts (tunables), calculate.ts, award.ts
│       ├── tasks/                # selection.ts (swappable SelectionStrategy)
│       ├── routes/               # health, auth, tasks, points
│       ├── middleware/           # requireAuth
│       ├── config.ts             # env-sourced runtime config (appUrl, Resend)
│       └── app.ts / index.ts
├── public/fonts/                 # Nunito web fonts (kept from original)
├── CLAUDE.md
├── PROJECT_SPEC.md
└── README.md
```

## Local dev environment

- Docker Compose (Mac or WSL2 Ubuntu) — a **MySQL 8.0 container only**; the app
  (client + server) runs on the host, not in containers. No MySQL is installed
  on the host itself.
- DB access layer: **Drizzle ORM** (+ `mysql2` driver). Schema lives in
  `server/src/db/schema.ts`.
- First-time setup:
  1. `cp .env.example .env` and `cp server/.env.example server/.env`
  2. `npm install`
  3. `npm run db:up` — starts MySQL 8.0 (exposed on `localhost:3306`, data in the
     `db_data` volume)
  4. `npm run db:migrate` — applies Drizzle migrations from `server/drizzle/`
  5. `npm run dev` — client on http://localhost:5173, API on http://localhost:3001
- Changing the schema: edit `server/src/db/schema.ts`, then `npm run db:generate`
  to emit a new SQL migration, then `npm run db:migrate` to apply it.
- `DATABASE_URL` in `server/.env` must match the `MYSQL_*` credentials in the
  root `.env` (both default to user `addiapp` / password `addiapp` / db `addiapp`).
- Reset the DB (drop the volume + recreate) with `npm run db:reset`; stop it with
  `npm run db:down` (data persists in the `db_data` volume). The `db:up`/`db:down`
  scripts (`scripts/db.sh`) auto-pick `docker-compose` on macOS and `docker
  compose` on Linux/WSL, matching wptips.
- **macOS + colima gotcha:** if `docker` reports "command not found" even though
  colima is installed, the Homebrew `docker` CLI just isn't linked. Fix once:
  `ln -sf "$(brew --prefix docker)/bin/docker" /opt/homebrew/bin/docker` then
  `colima start`.

## Screens (built)

All Play-mode and dashboard screens are implemented and merged to `develop`
(#29–#38, #69) — see "What's built" above and PROJECT_SPEC §5/§6. The only
screens still not designed/built are the marketing/landing homepage (#40) and
the user guide/help content (#41) — both unscoped.

Mascot: placeholder simple flat character only (used consistently across all
screens). Real mascot art + expression variations is a deliberate later design
pass, likely in Claude Design once the UX flow is locked.

Color palette used in mockups: warm coral primary (`#D85A30`), supporting
teal/amber/purple for badges/tags — not a literal Duolingo green, not yet
locked as final brand palette.

## Coding standards

- TypeScript on both client and server — confirmed.
- React functional components + hooks, no class components.
- Express: standard REST conventions; route handlers stay thin, business logic
  lives in modules (`points/`, `tasks/selection.ts`).
- DB access via **Drizzle ORM** (parameterized) — no raw string concatenation.
- Client API calls: a shared `apiRequest` wrapper (`client/src/lib/api.ts`, from
  #61) that sends cookies and throws `ApiError` — the auth pages use it. The
  older Play-mode clients (`lib/tasks.ts`, `lib/points.ts`) still use plain
  `fetch` with `credentials: 'include'`; unifying them onto `apiRequest` is a
  future cleanup, not required.
- **Zod** validates request bodies/queries server-side; the client mirrors the
  same rules for fast feedback, but the server is authoritative.
- Environment variables via `.env` (never committed).

## Deployment — TBD, key open question

- GitHub Actions → FTP sync is confirmed for the static frontend build.
- The Express backend cannot be deployed via FTP alone (FTP doesn't restart a
  Node process). **Open question: is SSH available on this KnownHost shared
  plan?** This determines whether backend deploy can be scripted (SSH +
  cPanel API / Passenger restart) or requires manual intervention in cPanel
  after each deploy.
- No `.htaccess`, reverse proxy config, or SPA rewrite rules written yet —
  needed once the frontend is a client-routed SPA under Apache/LiteSpeed.

## How to help me

- Assume strong technical knowledge — skip basic explanations unless asked
- Ask, don't assume — if intent/architecture/requirements are unclear, ask
  before writing code (this project is early-stage; a lot is still TBD, so
  expect more clarifying questions than a mature project)
- Lead with the most practical solution first; call out hosting/deployment
  constraints specific to KnownHost shared hosting when relevant
- Actively suggest better/longer-lasting solutions when you see one, but
  match complexity to the problem — this is a personal project, not
  enterprise software; don't over-engineer
- Keep responses focused

## Never do these things

- Never suggest Next.js, SSR, or any framework/pattern that assumes a
  Vercel-style host — this is shared cPanel hosting via FTP
- Never suggest Postgres or Supabase — MySQL/MariaDB only, self-hosted auth
- Never suggest Auth.js/NextAuth — custom auth only
- Never suggest hiding points until task completion — decided to show them
  up front
- Never reintroduce anything from the old codebase without it being an
  explicit, deliberate decision — default assumption is "discarded"
- Never assume SSH is available on the shared plan until confirmed — deploy
  suggestions should account for FTP-only as the safe default until this is
  resolved
- Never "fix" AddiApp to use Brevo for consistency with wptips.com — AddiApp
  uses Resend for transactional email by deliberate choice; they are
  intentionally different providers for different needs.
- Never switch auth to JWT or a client-stored token — it's DB-backed sessions
  (opaque httpOnly `sid` cookie) by decision, so logout/expiry revoke immediately.
- Never inline task-selection logic into the route — it lives behind the
  `SelectionStrategy` interface (`server/src/tasks/selection.ts`) so a per-user
  preference stays a one-line swap.
- Never hardcode points numbers outside `server/src/points/config.ts` — that's
  the single source; the client reads base points from `GET /api/points`.

## Open decisions log

Resolved items removed in the 2026-07-12 sync. Genuinely still open:

- [ ] Node.js version to target on KnownHost (Passenger / Node.js Selector)
- [ ] SSH availability on KnownHost shared plan (drives backend deploy — #39)
- [ ] Marketing / landing homepage scope (#40)
- [ ] User guide / help content scope (#41)
- [ ] Production email readiness — Resend domain verification for addiapp.com (#65)
- [ ] Signup rate-limiting / auth abuse protection
- [ ] Privacy policy / Terms of Service pages
- [ ] Home secondary-link set (Add task / Dashboard / Stats) — right long-term
  set vs. a single Dashboard entry (noted at #29's merge)
- [ ] Final color palette / brand direction (placeholder warm coral in use)
- [ ] Real mascot art (placeholder flat character in use)
- [x] Monorepo vs split repos — **monorepo** (npm workspaces)
- [x] Query builder / ORM — **Drizzle ORM** (+ mysql2)
- [x] Auth model — **DB-backed sessions + bcryptjs** (not JWT)
- [x] Speed-bonus formula, daily-multiplier cap/growth — **finalized** (§7)
- [x] Task-selection algorithm — **weighted-random, swappable strategy**
- [x] In-progress / completion / add-task / dashboard designs — **built**
