# e2e / a11y verification harness

A small, reusable tool for **live-verifying client-side interaction and
accessibility behavior** — driving real keyboard, focus and ARIA in a browser and
asserting what a screen-reader/keyboard user actually gets. It's the only
in-repo way to verify UI behavior beyond typecheck/lint/build.

**This is not a full e2e test suite** and isn't wired into CI. It's a documented,
runnable pattern you point at local dev. Built for #126 (the a11y cluster),
preserved by #170.

## How it works

- Uses **`puppeteer-core`** driving your **system Chrome** — no bundled Chromium
  download. Default Chrome path is the macOS location; override with `CHROME=…`.
- Logs in through the real login form as a dev user, then drives pages and asserts
  DOM/ARIA/focus and simulates real key events (Tab, Arrow keys, Enter, Escape).

## Prerequisites

1. **Dev stack running:** `npm run dev` (from the repo root) — Vite on `:5173`
   proxying `/api` to the PHP dev server on `:3001`, against the local docker MySQL
   (`npm run db:up` first if needed).
2. **A verified dev user.** Defaults to `demo@addiapp.local` / `demopass123`. If it
   doesn't exist, register it and mark it verified in the dev DB:
   ```sql
   UPDATE users SET email_verified = 1 WHERE email = 'demo@addiapp.local';
   ```
   (login is gated on verification). Override creds with `E2E_EMAIL` / `E2E_PASSWORD`.
3. **Google Chrome installed** (any recent version).

## Run

```bash
# with the dev stack already up:
npm run e2e:a11y -w client
# or directly:
node client/e2e/a11y.mjs
```

Prints `PASS`/`FAIL` per assertion and exits non-zero on any failure. Takes ~20s
(it deliberately waits out the 5s undo-toast window twice to prove pause-on-focus).

Env overrides: `CHROME`, `E2E_BASE_URL` (default `http://localhost:5173`),
`E2E_EMAIL`, `E2E_PASSWORD`.

## Writing a new check

`lib.mjs` gives you the reusable pieces:

```js
import { launch, login, seedTask, reporter, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await login(page)                    // authenticated session
await seedTask(page, 'My task')      // create a backlog task via the API

await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
ok(await page.$('table') !== null, 'dashboard renders a table')

process.exit(done())
```

Assert against real behavior, not just attribute presence: focus something and
press a key, then read `document.activeElement` / `aria-checked` / etc. See
`a11y.mjs` for worked examples (roving-tabindex arrow nav, skip-link focus jump,
toast pause-on-focus timing, in-place Completion focus).

## Notes

- `e2e/` is `.mjs` and lives outside `src/`, so it's excluded from `tsc -b`,
  `eslint`, and the Vite build by construction — it never touches the shipped app.
- `puppeteer-core` is a **dev**Dependency and is never bundled.
