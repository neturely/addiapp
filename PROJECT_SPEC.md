# AddiApp — Rebuild Project Spec

Living document. Updated as decisions are made. Last updated: 2026-07-11.

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

- **Frontend**: React + Vite, static build (SPA, client-side routing via
  React Router). No Next.js — SSR/App Router doesn't fit shared hosting +
  FTP deploy well.
- **Backend**: Node.js + Express, run via cPanel's "Setup Node.js App"
  (Passenger).
- **Database**: MySQL/MariaDB (not Postgres — not available on shared
  cPanel plans).
- **Auth**: custom, self-rolled (sessions or JWT + bcrypt). Not Supabase
  Auth, not Auth.js/NextAuth (Auth.js is tightly coupled to Next.js API
  routes).
- **Styling**: Tailwind CSS.
- **Deploy**: GitHub Actions. Static frontend build synced via FTP;
  Express backend deploy mechanism still TBD (FTP alone doesn't restart a
  Node process — need to confirm SSH availability on the shared plan).

Open question: confirm whether SSH is available on the KnownHost shared
plan, since that changes how the Express app gets deployed/restarted.

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

Screens designed so far (mockups built in chat, not yet as real
components):

1. **Home** — mascot + "Ready to do something great today?" + single
   "Let's go" primary CTA. Secondary link to Dashboard.
2. **Choice screen** — "What kind of win do you want?" → Something small
   (quick win, low effort) vs Something big (real progress, bigger
   effort). Time available is also a filter input here.
3. **Task presented** — algorithm picks ONE task matching the chosen
   filters. Shows title, estimated time, small/big tag, and points
   (approximate/shown up front, not hidden — see §6 on why). Primary
   action: **Start** (moves task to in-progress). Secondary: "Give me
   something else" (re-roll).
4. **Empty state** — if no tasks match/exist: mascot + "Nothing here
   right now" + "Add a task" primary CTA + link to Dashboard.

Not yet designed:
- Task in-progress screen (what does "in progress" look like/do?)
- Task completion screen (celebration moment — this is a key
  gamification beat, mascot should react here)
- Add-task form itself

**Requirement**: this entire flow (choice → task → start) must also be
usable from the Dashboard in a denser, manual form — Dashboard users
shouldn't be locked out of the game loop, just given a less guided
version of it.

## 6. Dashboard (admin view)

Clean, Todoist/Linear-style. Purpose: add/edit/list all tasks, manage
backlog, see everything at once (not one-at-a-time like Play mode).

Confirmed requirements:
- Add task form (title, complexity, estimated time — see §7)
- Full task list/management
- User card showing points (see §7) — dashboard-level summary
- Same task-selection flow available here in dense/manual form

Not yet designed: actual layout (list vs table vs cards), filtering/
sorting, editing UX.

## 7. Points / gamification system

**Status: core formula partially decided, two open numbers flagged
below.**

- **Base points by complexity** (set at task creation):
  - Low = 2 pts
  - Medium = 5 pts
  - High = 10 pts
- **Estimated time**: user enters manually at task creation (minutes).
  Deliberately not auto-calculated from complexity, since complexity and
  time don't reliably correlate (a "complex" task might only take 15
  min).
- **Speed bonus**: awarded when actual completion time < estimated time.
  Scaled to how much faster the user finishes (not a flat bonus) — e.g.
  finishing in half the estimated time earns more bonus than finishing
  10% early. **Exact formula/curve not yet defined — needs a follow-up
  decision.**
- **Daily multiplier**: grows with each task completed in a day (e.g.
  +0.1x per task), shown live in the UI (e.g. "current bonus: 1.3x"),
  resets at midnight. **Confirmed: capped**, but the actual cap value is
  still a placeholder (2.0x) — needs a real number.
- **Points are shown up front** (approximate, before the user commits to
  a task) — not hidden until completion. Decided explicitly: visibility
  is motivating, and the speed bonus rewards finishing fast rather than
  the reward itself being a surprise.

**Where points are displayed**: a user page (points/stats, dedicated
screen) and a user card on the Dashboard (points summary at a glance).
Both are confirmed as needed; neither is designed yet.

**Open decisions to resolve:**
1. Exact speed-bonus formula/curve (how "how early" maps to bonus %).
2. Daily multiplier cap value (currently placeholder 2.0x).
3. Daily multiplier growth rate per task (currently placeholder +0.1x —
   confirm or adjust).

## 8. Release scope

**Decided**: build a genuinely minimal first release, then branch
everything else into later phases. Full reconciliation of "what's in
release 1" is still pending — draft split below, to be refined together.

### Release 1 (draft — needs confirmation)
- Custom auth (register/login, bcrypt + sessions or JWT)
- Task CRUD (title, complexity, estimated time)
- Points system as defined in §7 (with the open numbers resolved)
- Play mode flow: Home → choice → task presented → start → complete
  (celebration screen still needs designing)
- Dashboard: task list/management + user points card
- Basic user page showing points/stats
- Marketing/landing homepage explaining what AddiApp is (separate from
  the in-app "Play" home) — mentioned as needed, not yet scoped
- Basic user guide/help content — mentioned as needed, not yet scoped

### Explicitly deferred to later releases
- Multi-user competitive features: leaderboards, scoreboard
- Projects (grouping tasks)
- Teams
- Issue/task sharing for bonus points
- Real mascot art + expression variations (placeholder used in v1)
- Anything else from the old `OLD_SPEC.md` roadmap not listed above
  (categories, tags, due dates, recurring tasks, attachments,
  notifications, dark mode, search, filtering, drag & drop, PWA/offline,
  audit history, AI-assisted task management)

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

- [ ] SSH availability on KnownHost shared plan (affects backend deploy)
- [ ] Speed bonus formula/curve
- [ ] Daily multiplier cap value
- [ ] Daily multiplier growth rate per task
- [ ] Task in-progress screen design
- [ ] Task completion/celebration screen design
- [ ] Add-task form design
- [ ] Dashboard layout (list/table/cards, filtering, sorting)
- [ ] Marketing homepage scope/content
- [ ] User guide scope/content
- [ ] Final color palette / brand direction (mockups used placeholder
  warm coral, not literal Duolingo green)
- [ ] Release 1 scope — confirm draft list in §8 is final
