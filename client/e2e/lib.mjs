// Shared helpers for the e2e/a11y harness (#170). Drives the REAL app in a real
// Chrome via puppeteer-core — no bundled Chromium. See README.md.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

// Where `scripts/e2e-setup.sh` parks the provisioned browser + its shared objects.
const CACHE = process.env.E2E_CACHE || join(homedir(), '.cache', 'e2e-chrome')

/**
 * Find a Chrome to drive (#437). Checked in order:
 *   1. $CHROME — always wins.
 *   2. The pinned Chrome for Testing from scripts/e2e-setup.sh.
 *   3. The platform's system Chrome.
 * Previously this was a hardcoded macOS path, which is why the suites looked
 * unrunnable on Linux/WSL.
 */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const provisioned = !existsSync(join(CACHE, 'chrome'))
    ? []
    : readdirSync(join(CACHE, 'chrome'), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(CACHE, 'chrome', e.name, 'chrome-linux64', 'chrome'))
        .filter(existsSync)
        .sort()
  if (provisioned.length) return provisioned[provisioned.length - 1] // newest version
  const system =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium']
  return system.find((p) => existsSync(p)) || system[0]
}

export const CHROME = findChrome()

// Ubuntu/WSL boxes lack five shared objects Chrome needs; e2e-setup.sh extracts
// them here without root. Handed to the BROWSER process only — see launch().
const LIB_DIR = join(CACHE, 'lib')

// The dev client (Vite) — it proxies /api to the PHP dev server. Start via `npm run dev`.
// VITE_PORT (2.6.0) lets the dev stack sit off 5173, so honour it as the default.
export const BASE = process.env.E2E_BASE_URL || `http://localhost:${process.env.VITE_PORT || 5173}`
const EMAIL = process.env.E2E_EMAIL || 'demo@addiapp.local'
const PASSWORD = process.env.E2E_PASSWORD || 'demopass123'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Minimal PASS/FAIL reporter. `done()` returns the failure count (use as exit code). */
export function reporter() {
  let pass = 0
  let fail = 0
  return {
    ok(cond, msg) {
      console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
      cond ? pass++ : fail++
    },
    done() {
      console.log(`\n${pass} passed, ${fail} failed`)
      return fail
    },
  }
}

/**
 * Launch headless Chrome, then check the dev stack is actually up.
 *
 * LD_LIBRARY_PATH goes to the browser's env rather than being exported by the
 * caller, so `node client/e2e/<suite>.mjs` works with no shell setup. The
 * reachability probe turns "dev server isn't running" from a 30s mystery
 * timeout on the first assertion into an immediate, readable error.
 */
export async function launch() {
  if (!existsSync(CHROME)) {
    throw new Error(`no Chrome at ${CHROME} — run \`npm run e2e:setup\` (see client/e2e/README.md)`)
  }
  try {
    await fetch(BASE)
  } catch {
    throw new Error(`dev client unreachable at ${BASE} — start it, or set E2E_BASE_URL/VITE_PORT`)
  }
  const env = { ...process.env }
  if (existsSync(LIB_DIR)) {
    env.LD_LIBRARY_PATH = [LIB_DIR, env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  }
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'], env })
}

/** Log in as the dev user via the real login form; throws if it didn't take. */
export async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await page.type('input[type=email]', EMAIL)
  await page.type('input[type=password]', PASSWORD)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type=submit]'),
  ])
  if (page.url().endsWith('/login')) {
    throw new Error(
      `login failed for ${EMAIL} — is the dev stack up and the user seeded + email-verified? (see README)`,
    )
  }
}

/**
 * Run one statement against the dev MySQL (harness-only — this never runs in
 * CI). Container/creds match the dev stack defaults; override the container
 * with E2E_DB_CONTAINER if yours differs.
 */
function devSql(sql) {
  execFileSync(
    'docker',
    [
      'exec',
      process.env.E2E_DB_CONTAINER || 'addiapp-mysql-1',
      'mysql',
      '-uaddiapp',
      '-paddiapp',
      'addiapp',
      '-e',
      sql,
      // 'pipe' keeps mysql's "password on the command line" warning out of the
      // suite output; a real failure still throws with the captured stderr.
    ],
    { stdio: 'pipe' },
  )
}

/**
 * Backdate a task's created_at/started_at (#383): the points regulation zeroes
 * completions under a minute old, so an e2e flow that wants a REAL award must
 * age its seeded task first.
 */
export function backdateTask(id, minutes = 120) {
  devSql(
    `UPDATE tasks SET created_at = DATE_SUB(created_at, INTERVAL ${Number(minutes)} MINUTE),
       started_at = IF(started_at IS NULL, NULL, DATE_SUB(started_at, INTERVAL ${Number(minutes)} MINUTE))
     WHERE id = ${Number(id)}`,
  )
}

/**
 * Clear today's daily_stats row for the dev user (#437).
 *
 * The #383 daily limits — 25 scored completions and 720 claimed minutes — are
 * per user per day, and one `e2e:all` pass completes well over a dozen tasks.
 * Without this the LATER suites in a run start scoring 0 for `daily_cap` /
 * `daily_budget` and any "a real award happened" assertion fails, in a way
 * that looks like a product bug and doesn't reproduce on a lone suite run.
 * Call it alongside backdateTask() before completing a task for real points.
 */
export function resetDailyStats() {
  devSql(
    `DELETE ds FROM daily_stats ds JOIN users u ON u.id = ds.user_id
       WHERE u.email = '${EMAIL.replace(/'/g, "''")}' AND ds.stat_date = CURDATE()`,
  )
}

/**
 * Clear the dev DB's rate_limits buckets (#437).
 *
 * Every suite signs in, so a second `e2e:all` inside the #80 login window
 * starts failing AT LOGIN — suites time out for a reason that has nothing to do
 * with what they assert. The limiter isn't under test here, so the runner
 * resets it rather than making a repeat run a manual chore. Best-effort: a dev
 * stack without the docker MySQL just carries on.
 */
export function clearRateLimits() {
  try {
    devSql('DELETE FROM rate_limits')
  } catch {
    // Not fatal — worst case a heavy run hits the limiter, as it did before.
  }
}

/**
 * Wait for the Completion screen, whatever it scored (#437).
 *
 * Suites used to wait for the text "nice work", which silently became a
 * scoring assertion: since #383 a task completed seconds after creation scores
 * 0 and since #400 a zeroed Completion reads "Done." instead. The heading's
 * aria-label carries "<title> complete." on every branch — zeroed, awarded, or
 * points-unknown — so match on that when the flow is not about the award. When
 * it IS about the award, backdateTask() + resetDailyStats() first.
 */
export function waitForCompletion(page, timeout = 5000) {
  return page.waitForFunction(
    () => /\bcomplete\./i.test(document.querySelector('h1')?.getAttribute('aria-label') || ''),
    { timeout },
  )
}

/** Create a backlog task for the logged-in user via the API; returns its id. */
export function seedTask(page, title, complexity = 'medium', estimatedMinutes = 10) {
  return page.evaluate(
    async (t, c, m) => {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, complexity: c, estimatedMinutes: m }),
      })
      const { task } = await r.json()
      return task.id
    },
    title,
    complexity,
    estimatedMinutes,
  )
}
