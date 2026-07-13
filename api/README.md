# AddiApp API (PHP)

Plain PHP 8.2 + PDO backend — no framework, no Composer dependencies. Replaces
the original Node/Express/Drizzle `server/` (KnownHost's plan doesn't run Node);
the HTTP contract is unchanged, so the React `client/` is untouched. See
issue #77 and PROJECT_SPEC.md §2.

## Layout

```
api/
├── public/index.php     # front controller (router + bootstrap)
├── public/.htaccess     # rewrite everything to index.php (LiteSpeed/Apache)
├── router.php           # dev router for `php -S`
├── migrate.php          # applies migrations/*.sql, tracked in _migrations
├── migrations/*.sql     # schema (ported from the Drizzle migrations)
├── config.example.php   # copy to config.php (prod, outside web root) for secrets
└── src/
    ├── Config, Db       # env/config + PDO
    ├── Http/            # Request, Response, Router
    ├── Auth/            # Passwords (bcrypt), Sessions (DB-backed), EmailTokens
    ├── Email/           # Resend (curl) + console transports, templates
    ├── Points/          # config, calculate, award (idempotent, stats, streak)
    ├── Tasks/Selection  # swappable weighted-random selection
    └── Controllers/     # Auth, Tasks, Points, Health
```

## Local development

Requires PHP 8.2+ and the local MySQL container (`npm run db:up`).

```bash
npm run db:up          # start MySQL 8 (docker)
npm run db:migrate     # php api/migrate.php — create/upgrade the schema
npm run dev            # client (5173) + PHP API (127.0.0.1:3001); Vite proxies /api
```

With no `RESEND_API_KEY`, emails use the **console transport** — the verify/reset
links are logged to the API server output instead of being sent.

Config precedence: built-in defaults < environment variables < `api/config.php`.
Local dev needs none of these — the defaults point at the docker MySQL.

## Production (KnownHost / cPanel / LiteSpeed)

Deploy is just files (no process to restart). The deploy pipeline (#39) rsyncs
`api/` to `~/api`, runs `php migrate.php` over SSH, and serves the SPA build from
the docroot with `/api/*` routed to `api/public/index.php`. Secrets live in
`api/config.php` **outside** the web root (`ADDIAPP_CONFIG` points at it):
`databaseUrl`, `resendApiKey`, `emailFrom`, `appUrl`, `isProd`.
