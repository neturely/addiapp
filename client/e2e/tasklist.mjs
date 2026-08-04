// Task-list behaviour checks (#262): offset pagination (prev/next + exact
// range), ready count, row → open-in-place view round-trip, delete flow.
// Plus the #310 project lifecycle block at the end: auto done ⇄ active and the
// archived-view permanent delete (confirm dialog + toast + tasks → Unassigned).
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
  (await page.$('button[aria-label="Previous page"]')) === null,
  '#262: prev arrow absent on the first page (arrows only render when usable)',
)

// Sort toggle: "newest first" (the default) ↔ "oldest first" flips row order + URL.
const firstBefore = await page.$eval(
  'ul[aria-label="Tasks"] button[aria-label^="Open "]',
  (b) => b.getAttribute('aria-label'),
)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === 'newest first')
    ?.click(),
)
await sleep(500)
ok(
  await page.evaluate(() => location.search.includes('sort=oldest')),
  '#256r: sort toggle writes ?sort=oldest',
)
const firstAfter = await page.$eval(
  'ul[aria-label="Tasks"] button[aria-label^="Open "]',
  (b) => b.getAttribute('aria-label'),
)
ok(firstAfter !== firstBefore, '#256r: oldest-first reverses the row order')
ok(
  await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'oldest first'),
  ),
  '#256r: toggle label flips to "oldest first"',
)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === 'oldest first')
    ?.click(),
)
await sleep(500)
ok(
  (await page.$eval('ul[aria-label="Tasks"] button[aria-label^="Open "]', (b) =>
    b.getAttribute('aria-label'),
  )) === firstBefore,
  '#256r: toggling back restores newest-first',
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

// --- #310: project lifecycle — auto done ⇄ active, then delete from Archived ---
const probe = await page.evaluate(async () => {
  const post = (path, body) =>
    fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json())
  const patch = (path, body) =>
    fetch(`/api${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json())
  const statusOf = async (id) => {
    const { projects } = await fetch('/api/projects?status=all', { credentials: 'include' }).then(
      (r) => r.json(),
    )
    return projects.find((p) => p.id === id)?.status ?? 'GONE'
  }

  const { project } = await post('/projects', { name: `Lifecycle probe ${Date.now()}` })
  const { task } = await post('/tasks', {
    title: 'Lifecycle task',
    complexity: 'low',
    estimatedMinutes: 5,
    projectId: project.id,
  })

  await patch(`/tasks/${task.id}`, { status: 'done' })
  const afterComplete = await statusOf(project.id)

  // Revert-on-assign: a fresh unfinished task assigned to the done project.
  const { task: second } = await post('/tasks', {
    title: 'Lifecycle revive',
    complexity: 'low',
    estimatedMinutes: 5,
  })
  await patch(`/tasks/${second.id}`, { projectId: project.id })
  const afterAssign = await statusOf(project.id)

  // Park it in Archived for the UI delete below (leave one task assigned).
  await patch(`/projects/${project.id}`, { status: 'archived' })
  return { id: project.id, name: project.name, afterComplete, afterAssign }
})
ok(probe.afterComplete === 'done', `#310: completing every task auto-marks the project done (${probe.afterComplete})`)
ok(probe.afterAssign === 'active', `#310: assigning an unfinished task reverts done → active (${probe.afterAssign})`)

// Archived grid: Delete → confirm dialog (states the kept-tasks consequence) → toast.
await page.goto(`${BASE}/dashboard?view=projects&archived=1`, { waitUntil: 'networkidle0' })
await page.waitForFunction(
  (n) => document.body.textContent?.includes(n),
  { timeout: 5000 },
  probe.name,
)
await page.evaluate((n) => {
  const card = [...document.querySelectorAll('div')].find(
    (d) => d.querySelector('h3')?.textContent === n,
  )
  ;[...card.querySelectorAll('button')].find((b) => /delete/i.test(b.textContent || ''))?.click()
}, probe.name)
await page.waitForSelector('[role=dialog]', { timeout: 3000 })
ok(
  await page.evaluate(() =>
    /kept and moved to unassigned/i.test(
      document.querySelector('[role=dialog]')?.textContent || '',
    ),
  ),
  '#310: delete confirm states the tasks-kept consequence',
)
await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /delete project/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[role=status]')].some((t) =>
      /moved to unassigned/i.test(t.textContent || ''),
    ),
  { timeout: 5000 },
)
ok(true, '#310: delete fires the "moved to Unassigned" toast')
ok(
  await page.evaluate((n) => !document.body.textContent?.includes(n), probe.name),
  '#310: the deleted project is gone from the archived grid',
)
// The assigned tasks survived, back in Unassigned.
ok(
  (await page.evaluate(async (pid) => {
    const { tasks } = await fetch('/api/tasks?unassigned=1&limit=100', {
      credentials: 'include',
    }).then((r) => r.json())
    return tasks.some((t) => /lifecycle/i.test(t.title)) && pid
  }, probe.id)) !== false,
  '#310: the project’s tasks survive deletion in Unassigned',
)

// --- Task archiving (#312): rail entry, archive tab, unarchive ---
const archTask = await page.evaluate(async () => {
  const r = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `e2e archive probe ${Date.now()}`, complexity: 'low', estimatedMinutes: 5 }),
  })
  const { task } = await r.json()
  await fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  })
  await fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: true }),
  })
  return task.id
})
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
const archRail = await page.evaluate(() => {
  const link = [...document.querySelectorAll('#app-rail a')].find(
    (a) => a.getAttribute('href') === '/dashboard?tab=archived',
  )
  return link ? (link.querySelector('span.tabular-nums')?.textContent?.trim() ?? '') : null
})
ok(archRail !== null && Number(archRail) >= 1, `#312: rail Archived entry with count (${archRail})`)
// The archived row is out of the default list but on the archived tab.
ok(
  await page.evaluate(() => !/e2e archive probe/i.test(document.body.textContent || '')),
  '#312: archived task is excluded from All tasks',
)
await page.goto(`${BASE}/dashboard?tab=archived`, { waitUntil: 'networkidle0' })
ok(
  await page.evaluate(() => /e2e archive probe/i.test(document.body.textContent || '')),
  '#312: archived tab lists the filed task',
)
// #330: the archived row's pill reads "Archived", never "Done".
const archPill = await page.evaluate(() => {
  const row = [...document.querySelectorAll('ul[aria-label="Tasks"] li')].find((li) =>
    /e2e archive probe/i.test(li.textContent || ''),
  )
  return row?.querySelector('span.rounded-full')?.textContent?.trim() ?? null
})
ok(archPill === 'Archived', `#330: archived row pill reads "Archived" (got "${archPill}")`)

// #330: un-filing happens in the TASK VIEW — its Status select shows
// "Archived"; picking Done saves back to plain Done (archived:false).
await page.goto(`${BASE}/tasks/${archTask}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('#task-status', { timeout: 5000 })
ok(
  (await page.$eval('#task-status', (s) => s.value)) === 'archived',
  '#330: task view Status shows "Archived" for a filed task',
)
await page.select('#task-status', 'done')
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /save changes/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(
  async (tid) => {
    const { task } = await fetch(`/api/tasks/${tid}`, { credentials: 'include' }).then((r) =>
      r.json(),
    )
    return task.archivedAt === null && task.status === 'done'
  },
  { timeout: 5000, polling: 500 },
  archTask,
)
ok(true, '#330: setting Status to Done un-files the task (back to plain Done)')

// Re-file it, then the archived tab's Delete action (replaced Unarchive):
// confirm modal → row gone → task gone server-side.
await page.evaluate(
  (tid) =>
    fetch(`/api/tasks/${tid}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    }),
  archTask,
)
await page.goto(`${BASE}/dashboard?tab=archived`, { waitUntil: 'networkidle0' })
await page.evaluate(() =>
  [...document.querySelectorAll('main button')]
    .find((b) => /^delete e2e archive probe/i.test(b.getAttribute('aria-label') || ''))
    ?.click(),
)
await page.waitForSelector('[role=dialog]', { timeout: 5000 })
await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /delete task/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(
  () => !/e2e archive probe/i.test(document.querySelector('main')?.textContent || ''),
  { timeout: 5000 },
)
const deletedStatus = await page.evaluate(
  async (tid) => (await fetch(`/api/tasks/${tid}`, { credentials: 'include' })).status,
  archTask,
)
ok(deletedStatus === 404, '#330: archived-row Delete removes the task (confirmed, 404)')

// --- One-click Archive on Done views (#321) ---
// Task half: a done row exposes the trailing Archive button; clicking removes it.
const oneClick = await page.evaluate(async () => {
  const r = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `e2e oneclick probe ${Date.now()}`, complexity: 'low', estimatedMinutes: 5 }),
  })
  const { task } = await r.json()
  await fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  })
  return task.id
})
await page.goto(`${BASE}/dashboard?tab=done`, { waitUntil: 'networkidle0' })
const rowArchive = await page.evaluate(() =>
  [...document.querySelectorAll('main button')].some((b) =>
    /^archive e2e oneclick probe/i.test(b.getAttribute('aria-label') || ''),
  ),
)
ok(rowArchive, '#321: done row exposes the trailing Archive button')
await page.evaluate(() =>
  [...document.querySelectorAll('main button')]
    .find((b) => /^archive e2e oneclick probe/i.test(b.getAttribute('aria-label') || ''))
    ?.click(),
)
await page.waitForFunction(
  () => !/e2e oneclick probe/i.test(document.querySelector('main ul')?.textContent || ''),
  { timeout: 5000 },
)
ok(
  await page.evaluate(async (tid) => {
    const { task } = await fetch(`/api/tasks/${tid}`, { credentials: 'include' }).then((r) => r.json())
    return task.archivedAt !== null
  }, oneClick),
  '#321: row Archive files the done task (archivedAt set, row gone)',
)
await page.evaluate(
  (tid) => fetch(`/api/tasks/${tid}`, { method: 'DELETE', credentials: 'include' }),
  oneClick,
)

// Project half: a done card exposes a visible Archive button.
const doneProject = await page.evaluate(async () => {
  const r = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `e2e done-card probe ${Date.now()}` }),
  })
  const { project } = await r.json()
  const tr = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'done-card task', complexity: 'low', estimatedMinutes: 5, projectId: project.id }),
  })
  const { task } = await tr.json()
  await fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  })
  return { id: project.id, name: project.name, taskId: task.id }
})
await page.goto(`${BASE}/dashboard?view=projects&status=done`, { waitUntil: 'networkidle0' })
const cardArchive = await page.evaluate(
  (name) =>
    [...document.querySelectorAll('button')].some(
      (b) => (b.getAttribute('aria-label') || '') === `Archive ${name}`,
    ),
  doneProject.name,
)
ok(cardArchive, '#321: done project card exposes a visible Archive button')
await page.evaluate(
  (name) =>
    [...document.querySelectorAll('button')]
      .find((b) => (b.getAttribute('aria-label') || '') === `Archive ${name}`)
      ?.click(),
  doneProject.name,
)
await page.waitForFunction(
  (name) => !document.querySelector('main')?.textContent?.includes(name),
  { timeout: 5000 },
  doneProject.name,
)
ok(
  await page.evaluate(async (pid) => {
    const { projects } = await fetch('/api/projects?status=archived', { credentials: 'include' }).then(
      (r) => r.json(),
    )
    return projects.some((p) => p.id === pid)
  }, doneProject.id),
  '#321: card Archive moves the done project to Archived (card gone)',
)
// Cleanup: delete the archived probe project + its task.
await page.evaluate(async (probe) => {
  await fetch(`/api/projects/${probe.id}`, { method: 'DELETE', credentials: 'include' })
  await fetch(`/api/tasks/${probe.taskId}`, { method: 'DELETE', credentials: 'include' })
}, doneProject)

// --- Status pill on mixed-status lists (#322) ---
const pillProbe = await page.evaluate(async () => {
  const r = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `e2e pill probe ${Date.now()}`, complexity: 'high', estimatedMinutes: 5 }),
  })
  const { task } = await r.json()
  return task.id
})
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
const allPill = await page.evaluate(() => {
  const row = [...document.querySelectorAll('ul[aria-label="Tasks"] li')].find((li) =>
    /e2e pill probe/i.test(li.textContent || ''),
  )
  return row?.querySelector('span.rounded-full')?.textContent?.trim() ?? null
})
ok(allPill === 'Ready', `#322: All tab pill shows the STATUS (got "${allPill}")`)
await page.goto(`${BASE}/dashboard?tab=backlog`, { waitUntil: 'networkidle0' })
const tabPill = await page.evaluate(() => {
  const row = [...document.querySelectorAll('ul[aria-label="Tasks"] li')].find((li) =>
    /e2e pill probe/i.test(li.textContent || ''),
  )
  return row?.querySelector('span.rounded-full')?.textContent?.trim() ?? null
})
ok(tabPill === 'High', `#322: status tab keeps the DIFFICULTY pill (got "${tabPill}")`)
await page.evaluate(
  (tid) => fetch(`/api/tasks/${tid}`, { method: 'DELETE', credentials: 'include' }),
  pillProbe,
)

await browser.close()
process.exit(done())
