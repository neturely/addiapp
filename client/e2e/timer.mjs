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

// persists across navigation (/settings — a plain shell page; /stats is
// narrow-viewport-only since #260)
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' })
ok((await page.$(CHIP(id))) !== null, '#135: chip persists across pages')

// #419: one clock per surface — on the task's own InProgress screen the hero
// card is the clock, so the chip for THAT task hides…
await page.goto(`${BASE}/play/progress/${id}`, { waitUntil: 'networkidle0' })
ok((await page.$(CHIP(id))) === null, '#419: chip hides while its task is the viewed InProgress screen')
// …but a DIFFERENT parallel running task still earns the chip there.
const id2 = await seedTask(page, 'Timer chip probe B', 'medium', 20)
await start(id2)
await page.goto(`${BASE}/play/progress/${id}`, { waitUntil: 'networkidle0' })
ok((await page.$(CHIP(id2))) !== null, '#419: chip shows the OTHER running task on an InProgress screen')
ok((await page.$(CHIP(id))) === null, '#419: …and never the viewed task itself')
await page.evaluate(async (i) => {
  await fetch(`/api/tasks/${i}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'backlog' }) })
}, id2)

// #419: with the right column visible (wide), the RunningMirror is the one
// ticking clock — the chip hides and the Started row demotes to its pulse dot.
await page.setViewport({ width: 1400, height: 900 })
await page.goto(`${BASE}/dashboard?tab=in_progress`, { waitUntil: 'networkidle0' })
ok((await page.$('header a[href^="/play/progress/"]')) === null, '#419: chip hides while the column mirror is visible')
const wideRow = await page.evaluate(() => {
  const li = [...document.querySelectorAll('ul[aria-label="Tasks"] li')].find((el) =>
    /Timer chip probe/.test(el.textContent || ''),
  )
  return {
    digits: /\d+:\d\d/.test(li?.textContent || ''),
    dot: !!li?.querySelector('span.animate-pulse-dot'),
    mirrorClock: /\d+:\d\d/.test(
      [...document.querySelectorAll('aside, [class*=w-72]')].map((e) => e.textContent).join('') || '',
    ),
  }
})
ok(wideRow.dot && !wideRow.digits, '#419: Started row keeps the pulse dot but drops the ticking digits (wide)')
ok(wideRow.mirrorClock, '#419: the column mirror carries the live clock (wide)')
// …and both return on a narrow viewport (column gone) — never invisible.
await page.setViewport({ width: 800, height: 600 })
await page.goto(`${BASE}/dashboard?tab=in_progress`, { waitUntil: 'networkidle0' })
ok((await page.$(CHIP(id))) !== null, '#419: chip returns when the column is gone (narrow)')
ok(
  await page.evaluate(() => {
    const li = [...document.querySelectorAll('ul[aria-label="Tasks"] li')].find((el) =>
      /Timer chip probe/.test(el.textContent || ''),
    )
    return /\d+:\d\d/.test(li?.textContent || '')
  }),
  '#419: Started row digits return when the column is gone (narrow)',
)

// complete on the InProgress screen (in-place, no route change) → chip gone
// everywhere (checked from the dashboard — the chip is hidden on the viewed
// InProgress screen since #419, so assert on a plain shell page instead)
await page.goto(`${BASE}/play/progress/${id}`, { waitUntil: 'networkidle0' })
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /mark done/i.test(b.textContent || ''))?.click())
await page.waitForFunction(() => /nice work/i.test(document.body.textContent || ''), { timeout: 5000 })
await sleep(400)
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' })
ok((await page.$(CHIP(id))) === null, '#135: chip disappears after in-place completion (imperative refresh)')

const failures = done()
await browser.close()
process.exit(failures ? 1 : 0)
