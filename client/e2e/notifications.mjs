// Notification system checks (#366): the lazy activation sweep surfacing a
// recurring arrival, the header avatar dot + menu count, the Dashboard-style
// /notifications row list (message wording, unread dot, open action),
// open-marks-all-read, the row DISMISS (soft — must not resurrect on the next
// sweep), and completion removing the task's notification.
import { launch, login, reporter, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

// Baseline: mark anything pre-existing read so OUR probes drive unread state.
await page.evaluate(async () => {
  await fetch('/api/notifications', { credentials: 'include' })
  await fetch('/api/notifications/read', { method: 'POST', credentials: 'include' })
})

// Seed two recurring tasks already due — A drives the main flow + dismiss,
// B drives the completion-removes-notification path.
const today = new Date().toLocaleDateString('sv-SE')
const seed = (title, recurrence) =>
  page.evaluate(
    async (t, rec, date) => {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: t,
          complexity: 'low',
          estimatedMinutes: 5,
          availableFrom: date,
          recurrence: rec,
        }),
      })
      const { task } = await r.json()
      return task.id
    },
    title,
    recurrence,
    today,
  )
const stamp = Date.now()
const taskA = await seed(`e2e notify probe A ${stamp}`, { unit: 'week', interval: 2 })
const taskB = await seed(`e2e notify probe B ${stamp}`, { unit: 'day', interval: 1 })

// A route change makes the provider refetch → sweep runs → the avatar badge
// escalates to the RED unread state (label says "unread", dot = bg-primary).
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForFunction(
  () =>
    (document.querySelector('button[aria-label^="Account menu"]')?.getAttribute('aria-label') || '')
      .includes('unread'),
  { timeout: 5000 },
)
ok(
  await page.evaluate(() => !!document.querySelector('header span.bg-primary.ring-2')),
  '#366: unread state shows the red avatar dot',
)

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

// Open the view: Dashboard-style rows — message wording (shared Repeat
// vocabulary), unread dot, Open action, trailing dismiss.
await page.evaluate(() =>
  [...document.querySelectorAll('a')]
    .find((a) => a.getAttribute('href') === '/notifications')
    ?.click(),
)
await page.waitForSelector('ul[aria-label="Notifications"]', { timeout: 5000 })
const rowA = await page.evaluate(() => {
  const li = [...document.querySelectorAll('ul[aria-label="Notifications"] li')].find((el) =>
    /e2e notify probe A/i.test(el.textContent || ''),
  )
  if (!li) return null
  return {
    text: li.textContent || '',
    hasOpen: !!li.querySelector('button[aria-label^="Open "]'),
    unreadDot: !!li.querySelector('span.bg-primary'),
    hasDismiss: !!li.querySelector('button[aria-label^="Dismiss notification"]'),
  }
})
ok(
  rowA !== null && /was added — repeats every 2 weeks\./.test(rowA.text),
  `#366: message reads "<title> was added — repeats every 2 weeks."`,
)
ok(rowA?.hasOpen === true, '#366: row carries the Open-task action')
ok(rowA?.unreadDot === true, '#366: unread row shows the primary dot')
ok(rowA?.hasDismiss === true, '#366: row carries a trailing Dismiss button')

// Opening marked everything read: the badge DOWNGRADES to green (total-count
// state — items still exist in the view) rather than disappearing.
await page.waitForFunction(
  () => {
    const label =
      document.querySelector('button[aria-label^="Account menu"]')?.getAttribute('aria-label') || ''
    return !label.includes('unread') && /\(\d+ notifications?\)/.test(label)
  },
  { timeout: 5000 },
)
ok(
  await page.evaluate(
    () =>
      !!document.querySelector('header span.bg-success.ring-2') &&
      !document.querySelector('header span.bg-primary.ring-2'),
  ),
  '#366: after reading, the dot goes green (items remain, none new)',
)
const serverUnread = await page.evaluate(async () => {
  const { unreadCount } = await fetch('/api/notifications', { credentials: 'include' }).then((r) =>
    r.json(),
  )
  return unreadCount
})
ok(serverUnread === 0, `#366: opening the view marked all read (server unread: ${serverUnread})`)

// Dismiss A: the row leaves, and — the task still being due + backlog — the
// next sweep must NOT resurrect it (soft delete anchors the dedupe).
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /^Dismiss notification: e2e notify probe A/i.test(b.getAttribute('aria-label') || ''))
    ?.click(),
)
await page.waitForFunction(
  () => !/e2e notify probe A/i.test(document.querySelector('ul[aria-label="Notifications"]')?.textContent || ''),
  { timeout: 5000 },
)
const afterDismiss = await page.evaluate(async () => {
  const { notifications } = await fetch('/api/notifications', { credentials: 'include' }).then(
    (r) => r.json(),
  )
  return notifications.some((n) => /e2e notify probe A/i.test(n.data.title || ''))
})
ok(afterDismiss === false, '#366: dismissed notification stays gone through the next sweep')

// Completing B removes its notification (no dangling "it came back" notice).
await page.evaluate(
  (tid) =>
    fetch(`/api/tasks/${tid}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    }),
  taskB,
)
const afterComplete = await page.evaluate(async () => {
  const { notifications } = await fetch('/api/notifications', { credentials: 'include' }).then(
    (r) => r.json(),
  )
  return notifications.some((n) => /e2e notify probe B/i.test(n.data.title || ''))
})
ok(afterComplete === false, "#366: completing the task removes the task's notification")

// Cleanup: delete both probe tasks + the clone B's completion spawned (task
// deletion cascades any remaining notification rows).
await page.evaluate(async (ids) => {
  for (const tid of ids) {
    await fetch(`/api/tasks/${tid}`, { method: 'DELETE', credentials: 'include' })
  }
  const { tasks } = await fetch('/api/tasks', { credentials: 'include' }).then((r) => r.json())
  for (const t of tasks.filter((x) => /e2e notify probe/i.test(x.title))) {
    await fetch(`/api/tasks/${t.id}`, { method: 'DELETE', credentials: 'include' })
  }
}, [taskA, taskB])

await browser.close()
process.exit(done())
