# AddiApp

Gamified task app — a mascot-led "Play" flow guides you to one task at a time, and completing
tasks earns points with speed and daily-volume bonuses. A separate Dashboard gives a clean admin
view for managing tasks and projects.

**Live at [addiapp.com](https://addiapp.com).**

> See [`CLAUDE.md`](./CLAUDE.md) for project context and decisions (the most frequently
> synced authoritative reference) and [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the design
> spec. [`OLD_SPEC.md`](./OLD_SPEC.md) is historical reference only (the discarded
> Next.js/Supabase era).

## Stack

- **Client** — React 19 + Vite (SPA), React Router, Tailwind CSS v4, TypeScript
- **API** — plain PHP 8.2 + PDO (no framework, no Composer runtime deps)
- **Database** — MySQL 8.0 in dev (Docker), MariaDB 10.11 in production; hand-written SQL
  migrations applied by `api/migrate.php`
- **Auth** — custom: DB-backed server-side sessions (httpOnly `sid` cookie) + bcrypt
- **Email** — Resend (transactional: verification, password reset); console transport in dev
- **Hosting** — KnownHost cPanel/LiteSpeed; deployed by GitHub Actions (build + rsync over
  SSH + migrate) on push to `main` — see [`docs/DEPLOY.md`](./docs/DEPLOY.md)

## Repository layout

```
addiapp/
├── client/            # React + Vite SPA (TypeScript) — npm workspace
├── api/               # PHP 8.2 + PDO backend (public/, src/, migrations/, migrate.php)
├── tests/             # PHPUnit backend tests (Unit + Db suites)
├── scripts/           # db.sh (local DB helper), backup-db.sh (prod backups)
├── docs/DEPLOY.md     # deploy pipeline + server setup + backups
├── public/fonts/      # Nunito web fonts (kept from the original project)
├── CLAUDE.md          # project context + decisions (authoritative)
├── PROJECT_SPEC.md    # design spec
└── OLD_SPEC.md        # historical / superseded
```

npm workspaces cover the client only; the PHP `api/` is not an npm package.

## Prerequisites

- Node.js **20+** (see `.nvmrc`), npm **9+**
- PHP **8.2+** on the host (with `pdo_mysql`)
- Docker (the local MySQL runs in a container; on macOS, colima works)

## Setup

```bash
git clone git@github.com:neturely/addiapp.git
cd addiapp
npm install          # installs the client workspace
cp .env.example .env # local docker MySQL credentials
npm run db:up        # MySQL 8.0 on localhost:3306
npm run db:migrate   # php api/migrate.php
```

No local `api/config.php` is needed — the API's built-in defaults point at the docker
MySQL. Without a `RESEND_API_KEY`, emails use the console transport (links are logged to
the API output).

## Development

```bash
npm run dev          # client (Vite) + API (php -S) together
```

- Client dev server: http://localhost:5173
- API: http://127.0.0.1:3001 (the Vite dev server proxies `/api/*` to it)

## Useful scripts (run from the repo root)

| Script               | Description                                       |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Run client + PHP API together in watch mode       |
| `npm run dev:client` | Client only (Vite)                                |
| `npm run dev:api`    | API only (`php -S 127.0.0.1:3001 api/router.php`) |
| `npm run build`      | Build the client SPA                              |
| `npm run typecheck`  | Type-check the client                             |
| `npm run lint`       | ESLint                                            |
| `npm run format`     | Prettier write                                    |
| `npm run db:up`      | Start the local MySQL container                   |
| `npm run db:down`    | Stop it                                           |
| `npm run db:reset`   | Wipe + restart + re-migrate the local DB          |
| `npm run db:migrate` | Apply pending `api/migrations/*.sql`              |

## Tests

Backend tests are PHPUnit (`composer install`, then `composer test`). The `tests/Db`
suite needs a throwaway `addiapp_test` schema via `DATABASE_URL` and skips cleanly when
it's unset — see the "Backend tests" section in `CLAUDE.md` for setup. The client has a
puppeteer e2e/a11y harness in `client/e2e/` (`npm run e2e:a11y -w client`, needs the dev
stack running).

## License

MIT
