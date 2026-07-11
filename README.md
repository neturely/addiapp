# AddiApp

Gamified task app — a mascot-led "Play" flow guides you to one task at a time, and completing
tasks earns points with speed and daily-volume bonuses. A separate Dashboard gives a clean admin
view for managing tasks.

> **Full rebuild in progress.** The original Next.js/Supabase app was discarded. See
> [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the current design and [`CLAUDE.md`](./CLAUDE.md) for
> project context and decisions. [`OLD_SPEC.md`](./OLD_SPEC.md) is retained as historical reference
> only.

## Stack

- **Client** — React + Vite (SPA), React Router, Tailwind CSS, TypeScript
- **Server** — Node.js + Express, TypeScript
- **Database** — MySQL/MariaDB (not yet wired up — see issue #25)
- **Auth** — custom (bcrypt + sessions/JWT — issue #26)
- **Hosting** — KnownHost shared (cPanel/LiteSpeed), FTP deploy via GitHub Actions

## Repository layout

```
addiapp/
├── client/          # React + Vite SPA (TypeScript)
├── server/          # Node.js + Express API (TypeScript)
├── public/fonts/    # Nunito web fonts (kept from the original project)
├── CLAUDE.md        # project context + decisions (authoritative)
├── PROJECT_SPEC.md  # rebuild spec (authoritative)
└── OLD_SPEC.md      # historical / superseded
```

This is an npm-workspaces monorepo. `client` and `server` are independent workspaces.

## Prerequisites

- Node.js **20+** (see `.nvmrc`)
- npm **9+**

## Setup

```bash
git clone git@github.com:neturely/addiapp.git
cd addiapp
npm install          # installs all workspaces
cp server/.env.example server/.env
```

## Development

```bash
npm run dev          # runs client (Vite) and server (Express) together
```

- Client dev server: http://localhost:5173
- API: http://localhost:3001 (the Vite dev server proxies `/api/*` to it)

Run a single side if you prefer:

```bash
npm run dev:client
npm run dev:server
```

## Useful scripts (run from the repo root)

| Script              | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Run client + server in watch mode         |
| `npm run build`     | Build client, then compile the server     |
| `npm run start`     | Start the compiled server (`server/dist`) |
| `npm run typecheck` | Type-check both workspaces                |
| `npm run lint`      | ESLint across the monorepo                |
| `npm run format`    | Prettier write                            |

## License

MIT
