// Shell behaviour checks (#260): solo mode, rail nav + toggle, right column vs
// the header Stats icon (points never invisible), avatar menu disclosure, search.
// Run with the dev stack up: CHROME=… E2E_EMAIL=… E2E_PASSWORD=… node e2e/shell.mjs
import { launch, login, reporter, seedTask, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 }) // wide: right column territory
await login(page)
await seedTask(page, 'Shell probe task')

// --- dashboard (wide): rail + column, no Stats icon ---
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
ok((await page.$('#app-rail')) !== null, '#260: rail renders on the dashboard')
ok(
  (await page.$('aside[aria-label="Play and today"]')) !== null,
  '#260: right column renders at 1400px',
)
ok(
  (await page.$('a[aria-label="Your stats"]')) === null,
  '#260: no header Stats icon while the column is visible',
)
ok(
  (await page.$('input[aria-label="Search tasks and projects"]')) !== null,
  '#260: header search present on the dashboard',
)

// --- column toggle → Stats icon appears (points stay reachable) ---
await page.click('button[aria-label="Toggle side column"]')
await sleep(150)
ok(
  (await page.$('aside[aria-label="Play and today"]')) === null,
  '#260: column toggle hides the right column',
)
ok(
  (await page.$('a[aria-label="Your stats"]')) !== null,
  '#260: Stats icon appears when the column is hidden',
)
await page.click('button[aria-label="Toggle side column"]') // restore

// --- narrow viewport (< 1240): column gone, Stats icon on ---
await page.setViewport({ width: 1100, height: 900 })
await sleep(200)
ok(
  (await page.$('aside[aria-label="Play and today"]')) === null,
  '#260: right column absent below 1240px',
)
ok(
  (await page.$('a[aria-label="Your stats"]')) !== null,
  '#260: Stats icon present below 1240px — points never invisible',
)
await page.click('a[aria-label="Your stats"]')
await page.waitForFunction(() => /total points/i.test(document.body.textContent || ''), {
  timeout: 5000,
})
ok(true, '#260: /stats reachable + renders from the icon')
await page.setViewport({ width: 1400, height: 900 })

// --- rail toggle ---
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.click('button[aria-label="Toggle sidebar"]')
await sleep(150)
ok((await page.$('#app-rail')) === null, '#260: hamburger collapses the rail')
const expanded = await page.$eval('button[aria-label="Toggle sidebar"]', (b) =>
  b.getAttribute('aria-expanded'),
)
ok(expanded === 'false', '#260: hamburger aria-expanded reflects collapsed state')
await page.click('button[aria-label="Toggle sidebar"]')
await sleep(150)
ok((await page.$('#app-rail')) !== null, '#260: hamburger restores the rail')

// --- solo mode on Play ---
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
ok((await page.$('#app-rail')) === null, '#260: solo mode — no rail on /play')
ok(
  (await page.$('aside[aria-label="Play and today"]')) === null,
  '#260: solo mode — no right column on /play',
)
ok(
  (await page.$('input[aria-label="Search tasks and projects"]')) === null,
  '#260: solo mode — no search on /play',
)
ok(
  (await page.$('a[aria-label="Your stats"]')) !== null,
  '#260: solo mode — Stats icon keeps points reachable',
)

// --- avatar menu disclosure ---
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.click('button[aria-label^="Account menu"]')
await sleep(100)
ok(
  await page.evaluate(() => /sign out/i.test(document.body.textContent || '')),
  '#260: avatar menu opens with Sign out',
)
ok(
  await page.evaluate(() => !/sign out other devices/i.test(document.body.textContent || '')),
  '#304: avatar menu no longer offers Sign out other devices (moved to Settings)',
)
await page.keyboard.press('Escape')
await sleep(100)
ok(
  await page.evaluate(() => !/sign out/i.test(document.body.textContent || '')),
  '#260: Escape closes the avatar menu',
)
ok(
  await page.evaluate(() =>
    document.activeElement?.getAttribute('aria-label')?.startsWith('Account menu'),
  ),
  '#260: focus returns to the avatar trigger on Escape',
)

// --- #385: the "How points work" guide (avatar menu + the panel ? icons) ---
// The right column's Today / All-time panels each carry a ? link to the guide.
const helpIcons = await page.evaluate(
  () => document.querySelectorAll('aside a[aria-label="How points work"]').length,
)
ok(helpIcons === 2, `#385: Today + All-time panels carry the ? guide link (got ${helpIcons})`)
// The avatar menu links it too, and the page renders SERVED numbers.
await page.click('button[aria-label^="Account menu"]')
await sleep(100)
await page.evaluate(() =>
  [...document.querySelectorAll('a')]
    .find((a) => /how points work/i.test(a.textContent || ''))
    ?.click(),
)
await page.waitForFunction(
  () => /fair play: a day can only hold a day/i.test(document.body.textContent || ''),
  { timeout: 5000 },
)
const guide = await page.evaluate(() => {
  const text = document.body.textContent || ''
  return {
    base: /low \+2/i.test(text) && /high \+10/i.test(text),
    limits: /25 scoring tasks/i.test(text) && /12 hours/i.test(text),
    sprint: /one-shot sprint/i.test(text),
  }
})
ok(guide.base, '#385: guide renders the served base points (Low +2 … High +10)')
ok(guide.limits, '#385: guide renders the served daily limits (25 tasks / 12 hours)')
ok(guide.sprint, '#385: guide explains the one-shot sprint bonus rule')
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })

// --- search filters the loaded task list ---
await page.type('input[aria-label="Search tasks and projects"]', 'zzz-no-such-task')
await sleep(300)
ok(
  await page.evaluate(() => /nothing matches your search/i.test(document.body.textContent || '')),
  '#260: search with no matches shows the empty message',
)

await browser.close()
process.exit(done())
