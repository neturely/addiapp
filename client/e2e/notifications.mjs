// Notification system checks (#366): the lazy activation sweep surfacing a
// recurring arrival, the header avatar dot + menu count, the /notifications
// view (message wording, unread tint, task link), and open-marks-all-read.
import { launch, login, reporter, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

// Baseline: mark anything pre-existing read so OUR probe drives the unread state.
await page.evaluate(async () => {
  await fetch('/api/notifications', { credentials: 'include' })
  await fetch('/api/notifications/read', { method: 'POST', credentials: 'include' })
})

// Seed a recurring task already due (availableFrom today) — the next
// notifications fetch sweeps it into a notification.
const today = new Date().toLocaleDateString('sv-SE')
const probeTask = await page.evaluate(async (date) => {
  const r = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `e2e notify probe ${Date.now()}`,
      complexity: 'low',
      estimatedMinutes: 5,
      availableFrom: date,
      recurrence: { unit: 'week', interval: 2 },
    }),
  })
  const { task } = await r.json()
  return task.id
}, today)

// A route change makes the provider refetch → sweep runs → avatar dot appears.
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForFunction(
  () => !!document.querySelector('button[aria-label^="Account menu ("]'),
  { timeout: 5000 },
)
ok(true, '#366: avatar carries the unread indicator after the sweep')

// The avatar disclosure carries a Notifications item with the count.
await page.click('button[aria-label^="Account menu"]')
const menuItem = await page.evaluate(() => {
  const link = [...document.querySelectorAll('a')].find(
    (a) => a.getAttribute('href') === '/notifications',
  )
  return link ? (link.textContent || '').replace(/\s+/g, '') : null
})
ok(
  menuItem !== null && /^Notifications\d+$/.test(menuItem ?? ''),
  `#366: avatar menu has a Notifications item with the count (got "${menuItem}")`,
)

// Open the view: message wording (shared Repeat vocabulary), unread tint, link.
await page.evaluate(() =>
  [...document.querySelectorAll('a')]
    .find((a) => a.getAttribute('href') === '/notifications')
    ?.click(),
)
await page.waitForSelector('ul[aria-label="Notifications"]', { timeout: 5000 })
const row = await page.evaluate(() => {
  const li = [...document.querySelectorAll('ul[aria-label="Notifications"] li')].find((el) =>
    /e2e notify probe/i.test(el.textContent || ''),
  )
  if (!li) return null
  return {
    text: li.textContent || '',
    href: li.querySelector('a')?.getAttribute('href') ?? null,
    tinted: !!li.querySelector('a[class*="bg-primary-tint"]'),
  }
})
ok(
  row !== null && /was added — repeats every 2 weeks\./.test(row.text),
  `#366: message reads "<title> was added — repeats every 2 weeks."`,
)
ok(row?.href === `/tasks/${probeTask}`, `#366: row links to the task (got ${row?.href})`)
ok(row?.tinted === true, '#366: unread row is visually distinct (tint)')

// Opening marked everything read: the badge is gone and the server agrees.
await page.waitForFunction(
  () => !document.querySelector('button[aria-label^="Account menu ("]'),
  { timeout: 5000 },
)
const serverUnread = await page.evaluate(async () => {
  const { unreadCount } = await fetch('/api/notifications', { credentials: 'include' }).then((r) =>
    r.json(),
  )
  return unreadCount
})
ok(serverUnread === 0, `#366: opening the view marked all read (server unread: ${serverUnread})`)

// A revisit shows the row un-tinted (read state persisted).
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Notifications"]', { timeout: 5000 })
const revisit = await page.evaluate(() => {
  const li = [...document.querySelectorAll('ul[aria-label="Notifications"] li')].find((el) =>
    /e2e notify probe/i.test(el.textContent || ''),
  )
  return li ? { tinted: !!li.querySelector('a[class*="bg-primary-tint"]') } : null
})
ok(revisit !== null && revisit.tinted === false, '#366: revisit shows the row read (no tint)')

// Cleanup: delete the probe task (the notification keeps its snapshot, taskId
// goes null — verified at the DB tier; here we just tidy the task list).
await page.evaluate(
  (tid) => fetch(`/api/tasks/${tid}`, { method: 'DELETE', credentials: 'include' }),
  probeTask,
)

await browser.close()
process.exit(done())
