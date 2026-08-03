// Settings checks (#266/#304): the consolidated sectioned page, the Play
// selection preference round-trip, the delete-account modal's type-to-confirm
// gating (the actual deletion is covered by the PHPUnit Db test — deleting the
// shared dev user here would break every other suite), and — LAST, because it
// ends the session — the #304 "Sign out everywhere" danger action.
import { launch, login, reporter, sleep, BASE } from './lib.mjs'

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
  ['Profile', 'Email', 'Password', 'Play', 'Sign out', 'Delete account'].every((s) =>
    sections.includes(s),
  ),
  `#266/#304: all six sections render (${sections.join(', ')})`,
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
