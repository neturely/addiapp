// Responsive checks (#270, absorbing #98's hard requirements): 375px phone
// viewport — no horizontal scroll, ≥44px touch targets, the rail drawer, and
// points always reachable.
import { launch, login, reporter, seedTask, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 375, height: 720 })
await login(page)
await seedTask(page, 'Responsive probe with a longish title that must truncate')

const noHScroll = async (label) => {
  const w = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    main: document.getElementById('main-content')?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }))
  ok(
    w.doc <= w.inner && w.main <= w.inner,
    `#270: no horizontal scroll on ${label} at 375px (doc ${w.doc}, main ${w.main}, vw ${w.inner})`,
  )
}

// --- dashboard ---
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Tasks"]')
await noHScroll('the dashboard')
ok((await page.$('#app-rail')) === null, '#270: no static rail below sm')

// Row + pager touch targets ≥44px.
const targets = await page.evaluate(() => {
  const row = document.querySelector('ul[aria-label="Tasks"] button[aria-label^="Open "]')
  const pager = document.querySelector('button[aria-label="Next page"]')
  return {
    row: row?.getBoundingClientRect().height ?? 0,
    pager: pager?.getBoundingClientRect().height ?? 0,
  }
})
ok(targets.row >= 44, `#270: task row is a ≥44px target (${targets.row}px)`)
ok(targets.pager >= 44, `#270: pager button is a ≥44px target (${targets.pager}px)`)

// Points reachable: the Stats icon is in the header (no column at 375px).
ok(
  (await page.$('a[aria-label="Your stats"]')) !== null,
  '#270: Stats icon present at 375px — points one tap away',
)

// --- rail drawer ---
await page.click('button[aria-label="Toggle sidebar"]')
await sleep(200)
ok((await page.$('[role=dialog][aria-label="Navigation"]')) !== null, '#270: hamburger opens the drawer')
ok((await page.$('#app-rail')) !== null, '#270: drawer contains the rail')
const railTarget = await page.evaluate(
  () => document.querySelector('#app-rail a')?.getBoundingClientRect().height ?? 0,
)
ok(railTarget >= 44, `#270: drawer entries are ≥44px targets (${railTarget}px)`)
await page.keyboard.press('Escape')
await sleep(200)
ok(
  (await page.$('[role=dialog][aria-label="Navigation"]')) === null,
  '#270: Escape closes the drawer',
)
ok(
  await page.evaluate(
    () => document.activeElement?.getAttribute('aria-label') === 'Toggle sidebar',
  ),
  '#270: focus returns to the hamburger on Escape',
)

// Drawer navigation closes it and lands on the filter.
await page.click('button[aria-label="Toggle sidebar"]')
await sleep(200)
await page.evaluate(() =>
  [...document.querySelectorAll('#app-rail a')]
    .find((a) => /completed/i.test(a.textContent || ''))
    ?.click(),
)
await sleep(400)
ok(
  (await page.$('[role=dialog][aria-label="Navigation"]')) === null,
  '#270: navigating from the drawer closes it',
)
ok(
  await page.evaluate(() => location.search.includes('tab=done')),
  '#270: drawer link applied the Completed filter',
)

// --- task view + play + settings at 375px ---
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Tasks"]')
await page.click('ul[aria-label="Tasks"] button[aria-label^="Open "]')
await page.waitForSelector('input[aria-label="Title"]', { timeout: 3000 })
await noHScroll('the task view')

await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
await noHScroll('the Play choice card')

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' })
await noHScroll('settings')

await browser.close()
process.exit(done())
