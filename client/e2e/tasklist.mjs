// Task-list behaviour checks (#262): offset pagination (prev/next + exact
// range), ready count, row → open-in-place view round-trip, delete flow.
import { launch, login, reporter, seedTask, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

// Seed enough backlog tasks to force a second page (page size 25).
const have = await page.evaluate(async () => {
  const r = await fetch('/api/tasks?limit=1', { credentials: 'include' })
  const { total } = await r.json()
  return total
})
for (let i = have; i < 27; i++) await seedTask(page, `Paging probe ${i}`)

await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Tasks"]')

const toolbar = await page.evaluate(() => document.body.textContent || '')
ok(/\d+ tasks? ready to do/.test(toolbar), '#262: "N tasks ready to do" figure present')
ok(/1–25 of \d+/.test(toolbar), '#262: range label reads "1–25 of N"')

const rowCount = await page.$$eval('ul[aria-label="Tasks"] > li', (l) => l.length)
ok(rowCount === 25, `#262: first page renders 25 rows (got ${rowCount})`)

// Next page.
await page.click('button[aria-label="Next page"]')
await sleep(500)
const page2 = await page.evaluate(() => document.body.textContent || '')
ok(/26–\d+ of \d+/.test(page2), '#262: next page range starts at 26')
ok(
  await page.$eval('button[aria-label="Previous page"]', (b) => !b.disabled),
  '#262: prev enabled on page 2',
)
await page.click('button[aria-label="Previous page"]')
await sleep(500)
ok(
  /1–25 of \d+/.test(await page.evaluate(() => document.body.textContent || '')),
  '#262: prev returns to the first page',
)
ok(
  await page.$eval('button[aria-label="Previous page"]', (b) => b.disabled),
  '#262: prev disabled on the first page',
)

// Sort toggle: "oldest first" ↔ "newest first" flips the row order + URL.
const firstBefore = await page.$eval(
  'ul[aria-label="Tasks"] button[aria-label^="Open "]',
  (b) => b.getAttribute('aria-label'),
)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === 'oldest first')
    ?.click(),
)
await sleep(500)
ok(
  await page.evaluate(() => location.search.includes('sort=newest')),
  '#256r: sort toggle writes ?sort=newest',
)
const firstAfter = await page.$eval(
  'ul[aria-label="Tasks"] button[aria-label^="Open "]',
  (b) => b.getAttribute('aria-label'),
)
ok(firstAfter !== firstBefore, '#256r: newest-first reverses the row order')
ok(
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'newest first'),
  ),
  '#256r: toggle label flips to "newest first"',
)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === 'newest first')
    ?.click(),
)
await sleep(500)
ok(
  (await page.$eval('ul[aria-label="Tasks"] button[aria-label^="Open "]', (b) =>
    b.getAttribute('aria-label'),
  )) === firstBefore,
  '#256r: toggling back restores oldest-first',
)

// Row → task view → edit round-trip.
const title = await page.$eval(
  'ul[aria-label="Tasks"] button[aria-label^="Open "]',
  (b) => b.getAttribute('aria-label').replace(/^Open /, ''),
)
await page.click('ul[aria-label="Tasks"] button[aria-label^="Open "]')
await page.waitForSelector('input[aria-label="Title"]', { timeout: 3000 })
ok(
  (await page.$eval('input[aria-label="Title"]', (i) => i.value)) === title,
  '#262: task view loads the clicked task',
)
await page.evaluate(() => {
  const i = document.querySelector('input[aria-label="Title"]')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(i, 'Renamed by e2e')
  i.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.click('button[type="submit"]')
await sleep(600)
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Tasks"]')
ok(
  await page.evaluate(() =>
    [...document.querySelectorAll('ul[aria-label="Tasks"] button')].some((b) =>
      (b.textContent || '').includes('Renamed by e2e'),
    ),
  ),
  '#262: edit round-trip — renamed task shows in the list',
)

// Delete flow: open → Delete → confirm → back on the dashboard, row gone.
await page.click('ul[aria-label="Tasks"] button[aria-label="Open Renamed by e2e"]')
await page.waitForSelector('input[aria-label="Title"]', { timeout: 3000 })
await page.evaluate(() =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Delete')?.click(),
)
await page.waitForSelector('[role=dialog]', { timeout: 3000 })
await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /delete task/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 5000 })
await sleep(400)
ok(
  await page.evaluate(
    () =>
      ![...document.querySelectorAll('ul[aria-label="Tasks"] button')].some((b) =>
        (b.textContent || '').includes('Renamed by e2e'),
      ),
  ),
  '#262: confirmed delete removes the task and lands back on the list',
)

// /tasks/:id/edit deep link lands on the same view.
const anyId = await page.evaluate(async () => {
  const r = await fetch('/api/tasks?limit=1', { credentials: 'include' })
  const { tasks } = await r.json()
  return tasks[0].id
})
await page.goto(`${BASE}/tasks/${anyId}/edit`, { waitUntil: 'networkidle0' })
ok(
  (await page.$('input[aria-label="Title"]')) !== null,
  '#262: legacy /tasks/:id/edit deep link lands on the task view',
)

await browser.close()
process.exit(done())
