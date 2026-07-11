# AddiApp — Project Context

> Draft starter instructions, built from the rebuild-planning conversation as of
> 2026-07-11. This is a NEW project (rebuild from scratch) — much less is
> settled than a mature project's CLAUDE.md. Sections marked **TBD** need a
> decision before they can be treated as fixed. Update this file as decisions
> land; treat it the same way wptips.com's CLAUDE.md is treated — the
> authoritative reference that supersedes stale chat history.

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
- Auth: custom, self-rolled (sessions or JWT + bcrypt). Not Supabase Auth,
  not Auth.js/NextAuth.
- Styling: Tailwind CSS.
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

## Points / gamification system

- Base points by complexity (set at task creation): Low = 2, Medium = 5, High = 10
- Estimated time: user enters manually at task creation (minutes) — deliberately
  not auto-calculated from complexity, since they don't reliably correlate
- Speed bonus: awarded when actual completion time < estimated time, scaled
  to how much faster (not flat) — **exact formula/curve TBD**
- Daily multiplier: grows per task completed that day, shown live (e.g.
  "current bonus: 1.3x"), resets at midnight, confirmed capped — **cap value
  TBD (placeholder 2.0x)**, **growth rate per task TBD (placeholder +0.1x)**

## Repo structure

Monorepo (npm workspaces) — **decided**. Client and server in one repo.

```
addiapp/
├── docker-compose.yml            # local MySQL 8.0 for development
├── .github/workflows/            # auto-assign (deploy pipeline is issue #39)
├── client/                       # React + Vite SPA (TypeScript)
│   └── src/
├── server/                       # Node.js + Express API (TypeScript)
│   ├── drizzle/                  # generated SQL migrations
│   └── src/db/                   # Drizzle schema, connection, migrator
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
- Stop the DB with `npm run db:down` (data persists in the `db_data` volume).

## Screens designed so far (mockups only, not built)

"Play" mode (mascot-guided home):
1. Home — mascot + "Ready to do something great today?" + "Let's go" CTA +
   secondary link to Dashboard
2. Choice screen — "What kind of win do you want?" (small/quick vs
   big/effort) + time-available filter
3. Task presented — one task shown with title, time, tag, points; Start
   (→ in-progress) or "Give me something else" (re-roll)
4. Empty state — mascot + "Nothing here right now" + "Add a task" CTA +
   Dashboard link

Not yet designed: task in-progress screen, task completion/celebration
screen, add-task form, dashboard layout, user points page, dashboard user
card, marketing homepage, user guide.

Mascot: placeholder simple flat character only (used consistently across all
mockups so far). Real mascot art + expression variations is a deliberate
later design pass, likely in Claude Design once the UX flow is locked.

Color palette used in mockups: warm coral primary (`#D85A30`), supporting
teal/amber/purple for badges/tags — not a literal Duolingo green, not yet
locked as final brand palette.

## Coding standards — TBD, draft defaults

- TypeScript on both client and server (matches the old project's direction;
  not yet explicitly re-confirmed for the rebuild)
- React functional components + hooks, no class components
- Express: standard REST conventions, route handlers separated from business
  logic
- MySQL: use a query builder or lightweight ORM rather than raw string
  concatenation (specific choice not yet made — e.g. `mysql2` directly with
  parameterized queries vs. Prisma/Drizzle) — **needs a decision**
- Environment variables via `.env` (never committed) — mirrors old project's
  `.env.local` convention

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

## Open decisions log

- [ ] SSH availability on KnownHost shared plan
- [ ] Speed bonus formula/curve
- [ ] Daily multiplier cap value and growth rate per task
- [x] Monorepo vs split repos for client/server — **monorepo** (npm workspaces)
- [x] Query builder / ORM choice for MySQL — **Drizzle ORM** (+ mysql2)
- [ ] Task in-progress / completion screen design
- [ ] Add-task form design
- [ ] Dashboard layout
- [ ] Marketing homepage and user guide scope
- [ ] Final color palette / brand direction
- [ ] Release 1 scope confirmation
- [ ] Dev environment confirmation (Mac/WSL2/Docker/Claude Code — assumed from wptips.com)
