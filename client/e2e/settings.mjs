// Settings checks (#266/#304/#319): the consolidated sectioned page, the Play
// selection preference round-trip, the TOTP 2FA enroll→verify→disable cycle
// (#319 — codes computed here from the shown secret; ALWAYS ends disabled so
// the shared dev user never stays 2FA-locked for other suites), the
// delete-account modal's type-to-confirm gating (the actual deletion is
// covered by the PHPUnit Db test — deleting the shared dev user here would
// break every other suite), and — LAST, because it ends the session — the
// #304 "Sign out everywhere" danger action.
import { createHmac } from 'node:crypto'
import { launch, login, reporter, sleep, BASE } from './lib.mjs'

/** RFC 6238 (SHA1/6/30) — mirror of api/src/Auth/Totp.php for driving the UI. */
function totpCode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bytes = []
  let buffer = 0
  let bits = 0
  for (const ch of secret.toUpperCase().replace(/=+$/, '')) {
    buffer = (buffer << 5) | alphabet.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)))
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const off = h[19] & 0x0f
  const v = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(v % 1e6).padStart(6, '0')
}

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' })
const sections = await page.evaluate(() =>
  [...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim()),
)
ok(
  [
    'Profile',
    'Email',
    'Password',
    'Play',
    'Two-factor authentication',
    'Sign out & delete account',
  ].every((s) => sections.includes(s)),
  `#266/#304/#319/#330: all six sections render (${sections.join(', ')})`,
)
// #330: the consolidated danger section holds BOTH same-size buttons.
ok(
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('main section button')]
    const signOut = buttons.find((b) => /sign out everywhere/i.test(b.textContent || ''))
    const del = buttons.find((b) => /delete my account/i.test(b.textContent || ''))
    if (!signOut || !del) return false
    if (signOut.closest('section') !== del.closest('section')) return false
    return signOut.getBoundingClientRect().height === del.getBoundingClientRect().height
  }),
  '#330: Sign out + Delete share one section with equal-height buttons',
)

// Selection preference round-trip: change → toast → survives a reload.
await page.select('#selectionStrategy', 'oldestFirst')
await page.waitForSelector('[role=status][aria-live=polite]', { timeout: 5000 })
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' })
ok(
  (await page.$eval('#selectionStrategy', (s) => s.value)) === 'oldestFirst',
  '#266: selection preference persists across a reload',
)
// The server honours it: /api/tasks/next still returns a task under oldestFirst.
const nextOk = await page.evaluate(async () => {
  const r = await fetch('/api/tasks/next', { credentials: 'include' })
  return r.ok
})
ok(nextOk, '#266: /api/tasks/next works under the stored strategy')
await page.select('#selectionStrategy', 'weightedByAge') // restore the default
await sleep(400)

// #319 TOTP 2FA: enroll (password → secret → code confirm → backup codes),
// prove login becomes two-step, then disable — the dev user MUST end disabled.
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'demopass123'
await page.type('#totpSetupPassword', E2E_PASSWORD)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /set up two-factor auth/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForSelector('[role=dialog]', { timeout: 5000 })
const secret = await page.evaluate(
  () => document.querySelector('[role=dialog] .font-mono')?.textContent?.trim() ?? '',
)
ok(/^[A-Z2-7]{32}$/.test(secret), `#319: enroll modal shows a 32-char base32 secret`)
await page.type('#totpConfirmCode', totpCode(secret))
await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /^turn on$/i.test(b.textContent?.trim() || ''))
    ?.click(),
)
await page.waitForFunction(
  () => /save your backup codes/i.test(document.querySelector('[role=dialog]')?.textContent || ''),
  { timeout: 5000 },
)
const backupCount = await page.evaluate(
  () => document.querySelectorAll('[role=dialog] ul li').length,
)
ok(backupCount === 10, `#319: 10 backup codes shown exactly once (got ${backupCount})`)
await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /i saved these codes/i.test(b.textContent || ''))
    ?.click(),
)
await sleep(300)

// Login is now two-step: password alone answers totp_required + a challenge;
// the code completes it. Driven via fetch so the browser session stays usable.
const twoStep = await page.evaluate(
  async (email, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const body = await r.json()
    return { status: r.status, error: body.error, challenge: body.challenge }
  },
  process.env.E2E_EMAIL || 'demo@addiapp.local',
  E2E_PASSWORD,
)
ok(
  twoStep.status === 403 && twoStep.error === 'totp_required' && !!twoStep.challenge,
  '#319: password login answers totp_required + a challenge while 2FA is on',
)
const otpOk = await page.evaluate(
  async (challenge, code) => {
    const r = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code }),
    })
    return r.status
  },
  twoStep.challenge,
  totpCode(secret),
)
ok(otpOk === 200, '#319: verify-otp with a computed code completes the sign-in')

// Disable (password + current code) — restores the section to its Off state.
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' })
await page.type('#totpDisablePassword', E2E_PASSWORD)
await page.type('#totpDisableCode', totpCode(secret))
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /turn off two-factor auth/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForSelector('#totpSetupPassword', { timeout: 5000 })
ok(true, '#319: disable restores the setup form — dev user left with 2FA off')

// Delete-account modal: gated until "delete" + a password are entered.
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' })
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /delete my account/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForSelector('[role=dialog]', { timeout: 3000 })
const gate1 = await page.$eval('[role=dialog] button[type="submit"]', (b) => b.disabled)
ok(gate1, '#266: delete confirm disabled before typing')
await page.type('#deleteConfirm', 'delete')
await page.type('#deletePassword', 'not-checked-client-side')
await sleep(150)
const gate2 = await page.$eval('[role=dialog] button[type="submit"]', (b) => b.disabled)
ok(!gate2, '#266: typing “delete” + a password arms the confirm button')
await page.keyboard.press('Escape')
await sleep(200)
ok((await page.$('[role=dialog]')) === null, '#266: Escape closes the delete dialog')

// #304: "Sign out everywhere" — a danger section above Delete account. It ends
// THIS session too (revoke others + normal logout → /login), so it runs last.
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /sign out everywhere/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(() => window.location.pathname === '/login', { timeout: 8000 })
ok(true, '#304: Sign out everywhere lands on /login')
ok(
  (await page.evaluate(
    async () => (await fetch('/api/auth/me', { credentials: 'include' })).status,
  )) === 401,
  '#304: the current session is revoked too — "everywhere" includes this device',
)

await browser.close()
process.exit(done())
