# e2e / a11y verification harness

A small, reusable tool for **live-verifying client-side interaction and
accessibility behavior** — driving real keyboard, focus and ARIA in a browser and
asserting what a screen-reader/keyboard user actually gets. It's the only
in-repo way to verify UI behavior beyond typecheck/lint/build.

**This is not a full e2e test suite** and isn't wired into CI (the suites need
the whole dev stack — Vite + PHP + MySQL — and CI is deliberately the
PR-into-`main` gate only). It's a documented, runnable pattern you point at
local dev. Built for #126 (the a11y cluster), preserved by #170, made portable
by #437.

## How it works

- Uses **`puppeteer-core`** driving a real Chrome — no bundled Chromium in the
  repo. `lib.mjs` finds one automatically: `$CHROME` if set, else the pinned
  Chrome for Testing that `scripts/e2e-setup.sh` provisions, else the system
  Chrome for the platform.
- Logs in through the real login form as a dev user, then drives pages and asserts
  DOM/ARIA/focus and simulates real key events (Tab, Arrow keys, Enter, Escape).

## Setup (once per machine)

```bash
npm run e2e:setup -w client
```

Idempotent, and **needs no sudo**. On macOS it just checks for system Chrome. On
Linux/WSL it downloads a pinned Chrome for Testing into `~/.cache/e2e-chrome/`
and unpacks the five shared objects a bare Ubuntu lacks (`libnspr4`, `libnss3`,
`libasound2t64` — ~2 MB) beside it, then proves the browser starts. Everything
lands in `$HOME`, never `/tmp` (WSL wipes `/tmp` between restarts).

`lib.mjs` discovers all of that on its own, including handing
`LD_LIBRARY_PATH` to the browser process — so you never export anything.

## Prerequisites

1. **Dev stack running:** `npm run dev` (from the repo root) — Vite proxying
   `/api` to the PHP dev server, against the local docker MySQL (`npm run db:up`
   first if needed). If your stack isn't on the default port, set `VITE_PORT` (or
   `E2E_BASE_URL` outright); the suites fail fast with a clear message when the
   dev client is unreachable, rather than timing out on the first assertion.
2. **A verified dev user.** Defaults to `demo@addiapp.local` / `demopass123`. If it
   doesn't exist, register it and mark it verified in the dev DB:
   ```sql
   UPDATE users SET email_verified = 1 WHERE email = 'demo@addiapp.local';
   ```
   (login is gated on verification). Override creds with `E2E_EMAIL` / `E2E_PASSWORD`.

## Run

```bash
npm run e2e:all -w client        # every suite, sequentially, with a summary
npm run e2e:a11y -w client       # one suite (e2e:<name> for each file here)
node client/e2e/a11y.mjs         # or directly
```

Each suite prints `PASS`/`FAIL` per assertion and exits non-zero on any failure;
`e2e:all` exits non-zero if any suite did.

Env overrides: `CHROME`, `E2E_BASE_URL` (default `http://localhost:${VITE_PORT}`,
`VITE_PORT` defaulting to 5173), `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_CACHE`,
`E2E_DB_CONTAINER`.

## Points regulation affects these suites (#383)

Since 2.5.0 the scoring rules are part of the environment, and a suite that
ignores them fails for reasons that look like product bugs:

- **A task completed seconds after it was created scores 0** (`too_fast`), and a
  zeroed Completion renders "Done." instead of "Nice work!" (#400). So:
  - a flow that needs a **real award** must call `backdateTask(id)` **and**
    `resetDailyStats()` first;
  - a flow that merely needs the task completed should wait with
    `waitForCompletion(page)`, which matches either heading.
- **Daily limits are per user per day** (25 scored completions, 720 claimed
  minutes). One `e2e:all` pass completes well over a dozen tasks, so without
  `resetDailyStats()` the later suites silently start scoring 0.
- **Ten suites means ten logins**, which trips the #80 login rate limiter on a
  repeat run — suites then time out AT the login form. `e2e:all` clears the dev
  `rate_limits` table itself; if you hit it running a single suite, clear that
  table by hand.

These helpers talk straight to the docker MySQL and are harness-only — they
never run in CI, and never touch anything but the dev database.

## Writing a new check

`lib.mjs` gives you the reusable pieces:

```js
import { launch, login, seedTask, reporter, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await login(page) // authenticated session
await seedTask(page, 'My task') // create a backlog task via the API

await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
ok((await page.$('ul[aria-label="Tasks"]')) !== null, 'dashboard renders the task list')

process.exit(done())
```

Assert against real behavior, not just attribute presence: focus something and
press a key, then read `document.activeElement` / `aria-checked` / etc. See
`a11y.mjs` for worked examples (roving-tabindex arrow nav, skip-link focus jump,
toast pause-on-focus timing, in-place Completion focus).

Two habits that keep a check from rotting:

- **Wait for the change, don't sleep for it.** A fixed `sleep` races the refetch;
  `page.waitForFunction(…)` on the condition you actually mean does not.
- **Don't identify a row by its title.** Suites reuse fixed titles, so two runs
  can leave duplicates and a title compare quietly stops meaning what it says.

## Notes

- `e2e/` is `.mjs` and lives outside `src/`, so it's excluded from `tsc -b`,
  `eslint`, and the Vite build by construction — it never touches the shipped app.
- `puppeteer-core` is a **dev**Dependency and is never bundled.
