// Header in-progress timer chip (#135). Verifies it appears/ticks/links/persists
// and disappears after an in-place completion. Prereq: dev stack up + dev user.
//   node client/e2e/timer.mjs   (or: npm run e2e:timer -w client)
import { launch, login, seedTask, reporter, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await login(page)

const CHIP = (id) => `header a[href="/play/progress/${id}"]`
const chipText = (id) =>
  page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim(), CHIP(id))
const start = (id) =>
  page.evaluate(async (i) => {
    await fetch(`/api/tasks/${i}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })
  }, id)

// clear any leftover in-progress tasks so "hidden when idle" is deterministic
await page.evaluate(async () => {
  const r = await fetch('/api/tasks?status=in_progress', { credentials: 'include' })
  const { tasks } = await r.json()
  for (const t of tasks) {
    await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'backlog' }) })
  }
})

// idle → no chip
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
ok((await page.$('header a[href^="/play/progress/"]')) === null, '#135: no chip when nothing is in progress')

// start a task → chip appears on next load, links to its InProgress screen
const id = await seedTask(page, 'Timer chip probe', 'medium', 20)
await start(id)
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
ok((await page.$(CHIP(id))) !== null, '#135: chip appears for the in-progress task, linking to /play/progress/:id')
const t1 = await chipText(id)
ok(/\d+:\d\d/.test(t1 || ''), `#135: chip shows M:SS elapsed ("${t1}")`)

// ticks client-side
await sleep(2200)
const t2 = await chipText(id)
ok(t2 !== t1, `#135: chip ticks ("${t1}" → "${t2}")`)

// persists across navigation
await page.goto(`${BASE}/stats`, { waitUntil: 'networkidle0' })
ok((await page.$(CHIP(id))) !== null, '#135: chip persists across pages')

// complete on the InProgress screen (in-place, no route change) → chip disappears
await page.goto(`${BASE}/play/progress/${id}`, { waitUntil: 'networkidle0' })
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /complete/i.test(b.textContent || ''))?.click())
await page.waitForFunction(() => /nice work/i.test(document.body.textContent || ''), { timeout: 5000 })
await sleep(400)
ok((await page.$(CHIP(id))) === null, '#135: chip disappears after in-place completion (imperative refresh)')

const failures = done()
await browser.close()
process.exit(failures ? 1 : 0)
