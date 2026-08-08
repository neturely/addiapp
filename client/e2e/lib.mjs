// Shared helpers for the e2e/a11y harness (#170). Drives the REAL app in the
// system Chrome via puppeteer-core — no bundled Chromium. See README.md.
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'

// System Chrome (no download). Override with CHROME=… on non-mac / other installs.
export const CHROME =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// The dev client (Vite) — it proxies /api to the PHP dev server. Start via `npm run dev`.
export const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173'
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

/** Launch headless system Chrome. */
export function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
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
 * Backdate a task's created_at/started_at in the dev DB (#383): the points
 * regulation zeroes completions under a minute old, so an e2e flow that wants
 * a REAL award must age its seeded task first. Talks straight to the docker
 * MySQL (harness-only — this never runs in CI); container/creds match the dev
 * stack defaults, override with E2E_DB_CONTAINER if yours differs.
 */
export function backdateTask(id, minutes = 120) {
  execFileSync('docker', [
    'exec',
    process.env.E2E_DB_CONTAINER || 'addiapp-mysql-1',
    'mysql',
    '-uaddiapp',
    '-paddiapp',
    'addiapp',
    '-e',
    `UPDATE tasks SET created_at = DATE_SUB(created_at, INTERVAL ${Number(minutes)} MINUTE),
       started_at = IF(started_at IS NULL, NULL, DATE_SUB(started_at, INTERVAL ${Number(minutes)} MINUTE))
     WHERE id = ${Number(id)}`,
  ])
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
