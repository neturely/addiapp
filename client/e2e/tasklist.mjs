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
// Identify the order by the first few row labels JOINED, not by the top row
// alone: suites reuse fixed task titles, so across runs the newest and the
// oldest task can share a title and a single-row compare reads "unchanged"
// even though the list did flip (#437 — this failed only in a full run, right
// after shell.mjs seeded another "Shell probe task").
const topLabels = () =>
  page.$$eval('ul[aria-label="Tasks"] button[aria-label^="Open "]', (bs) =>
    bs
      .slice(0, 5)
      .map((b) => b.getAttribute('aria-label'))
      .join(' | '),
  )
const firstBefore = await topLabels()
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
// Wait for the re-fetched list rather than a fixed sleep: the URL updates
// synchronously but the rows arrive with the request, so a flat 500ms made this
// assertion race the network (#437).
let reordered = true
try {
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll('ul[aria-label="Tasks"] button[aria-label^="Open "]')]
        .slice(0, 5)
        .map((b) => b.getAttribute('aria-label'))
        .join(' | ') !== before,
    { timeout: 5000 },
    firstBefore,
  )
} catch {
  reordered = false
}
const firstAfter = await topLabels()
ok(reordered, `#256r: oldest-first reverses the row order ("${firstBefore}" → "${firstAfter}")`)
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
let restored = true
try {
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll('ul[aria-label="Tasks"] button[aria-label^="Open "]')]
        .slice(0, 5)
        .map((b) => b.getAttribute('aria-label'))
        .join(' | ') === before,
    { timeout: 5000 },
    firstBefore,
  )
} catch {
  restored = false
}
ok(restored, '#256r: toggling back restores newest-first')

// Row → task view → edit round-trip.
const title = await page.$eval('ul[aria-label="Tasks"] button[aria-label^="Open "]', (b) =>
  b.getAttribute('aria-label').replace(/^Open /, ''),
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
ok(
  probe.afterComplete === 'done',
  `#310: completing every task auto-marks the project done (${probe.afterComplete})`,
)
ok(
  probe.afterAssign === 'active',
  `#310: assigning an unfinished task reverts done → active (${probe.afterAssign})`,
)

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
    body: JSON.stringify({
      title: `e2e archive probe ${Date.now()}`,
      complexity: 'low',
      estimatedMinutes: 5,
    }),
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
// #406 (revising #332): the Overview EXCLUDES archived rows — they live in the
// Archived tab and the per-project/category filters only.
ok(
  await page.evaluate(() => {
    return ![...document.querySelectorAll('ul[aria-label="Tasks"] li')].some((li) =>
      /e2e archive probe/i.test(li.textContent || ''),
    )
  }),
  '#406: the Overview excludes the archived task',
)
ok(
  await page.evaluate(() => {
    // The clickable "Tasks" section HEAD (#256) also points at /dashboard and
    // comes first, so match the last one — the entry (#437: this used to grab
    // the head and read "Tasks", failing a rename that had actually shipped).
    const links = [...document.querySelectorAll('#app-rail a')].filter(
      (a) => a.getAttribute('href') === '/dashboard',
    )
    const entry = links[links.length - 1]
    const rail = document.querySelector('#app-rail')?.textContent || ''
    return /Overview/.test(entry?.textContent || '') && !/All tasks/i.test(rail)
  }),
  '#406: the rail\'s first Tasks entry reads "Overview" (and "All tasks" is gone)',
)
// #406: a per-project filter KEEPS the archived row, pill "Archived", sorted
// to the bottom below every open row.
const projArch = await page.evaluate(async (taskId) => {
  const r = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `e2e arch filter ${Date.now()}` }),
  })
  const { project } = await r.json()
  // The open row is CREATED AFTER yet must render ABOVE the archived one in
  // the default newest-first sort — and stay above it under oldest-first too.
  const t = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `e2e arch filter open ${Date.now()}`,
      complexity: 'low',
      estimatedMinutes: 5,
      projectId: project.id,
    }),
  }).then((x) => x.json())
  await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: project.id }),
  })
  return { projectId: project.id, openId: t.task.id }
}, archTask)
for (const sort of ['', '&sort=oldest']) {
  await page.goto(`${BASE}/dashboard?project=${projArch.projectId}${sort}`, {
    waitUntil: 'networkidle0',
  })
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('ul[aria-label="Tasks"] li')].map((li) => ({
      probe: /e2e archive probe/i.test(li.textContent || ''),
      pill: li.querySelector('span.rounded-full')?.textContent?.trim() ?? '',
    })),
  )
  const probeIdx = rows.findIndex((r) => r.probe)
  ok(
    probeIdx === rows.length - 1 && rows.length >= 2,
    `#406: project filter (${sort || 'newest'}) sorts the archived row last`,
  )
  ok(
    rows[probeIdx]?.pill === 'Archived',
    `#406: project filter keeps the "Archived" pill (${sort || 'newest'})`,
  )
}
// Unhook the probe from the project again so the later archive-tab blocks see
// the original shape; remove the helper project + its open task.
await page.evaluate(
  async ({ projectId, openId }, taskId) => {
    await fetch(`/api/tasks/${openId}`, { method: 'DELETE', credentials: 'include' })
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null }),
    })
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    await fetch(`/api/projects/${projectId}`, { method: 'DELETE', credentials: 'include' })
  },
  projArch,
  archTask,
)
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
// …but the Done STATUS tab still excludes it (done = done-not-filed).
await page.goto(`${BASE}/dashboard?tab=done`, { waitUntil: 'networkidle0' })
ok(
  await page.evaluate(
    () => !/e2e archive probe/i.test(document.querySelector('main')?.textContent || ''),
  ),
  '#332: the Done tab still excludes archived tasks',
)
// #363: the toolbar count scopes to the tab — Done shows the done figure +
// wording (was the global backlog's "ready to do" on every tab).
const tabCounts = await page.evaluate(async () => {
  const { counts } = await fetch('/api/tasks?limit=1', { credentials: 'include' }).then((r) =>
    r.json(),
  )
  return counts
})
const doneCountText = `${tabCounts.done} ${tabCounts.done === 1 ? 'task' : 'tasks'} done`
ok(
  await page.evaluate((t) => (document.body.textContent || '').includes(t), doneCountText),
  `#363: Done tab toolbar reads "${doneCountText}"`,
)
await page.goto(`${BASE}/dashboard?tab=archived`, { waitUntil: 'networkidle0' })
ok(
  await page.evaluate(() => /e2e archive probe/i.test(document.body.textContent || '')),
  '#312: archived tab lists the filed task',
)
// #363: same on Archived — its own figure, not the backlog's.
const archCountText = `${tabCounts.archived} ${tabCounts.archived === 1 ? 'task' : 'tasks'} archived`
ok(
  await page.evaluate((t) => (document.body.textContent || '').includes(t), archCountText),
  `#363: Archived tab toolbar reads "${archCountText}"`,
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
ok(
  await page.evaluate(() =>
    [...document.querySelectorAll('main span')].some(
      (s) => s.textContent?.trim() === 'Archived' && s.className.includes('rounded-full'),
    ),
  ),
  '#332: task view shows the "Archived" chip in the top bar',
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
    body: JSON.stringify({
      title: `e2e oneclick probe ${Date.now()}`,
      complexity: 'low',
      estimatedMinutes: 5,
    }),
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
    const { task } = await fetch(`/api/tasks/${tid}`, { credentials: 'include' }).then((r) =>
      r.json(),
    )
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
    body: JSON.stringify({
      title: 'done-card task',
      complexity: 'low',
      estimatedMinutes: 5,
      projectId: project.id,
    }),
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
    const { projects } = await fetch('/api/projects?status=archived', {
      credentials: 'include',
    }).then((r) => r.json())
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
    body: JSON.stringify({
      title: `e2e pill probe ${Date.now()}`,
      complexity: 'high',
      estimatedMinutes: 5,
    }),
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

// --- Recurring-badge placement + column alignment (#364; user feedback moved
// the badge INLINE in the title cluster: "Title ↻ Description") ---
// The fixed-width min/pts cell is always the row's last element, so the column
// keeps one right edge whether or not the conditional badge renders — and
// ruleless rows carry no reserved whitespace.
const recurProbe = await page.evaluate(async () => {
  const r = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `e2e recur align probe ${Date.now()}`,
      complexity: 'low',
      estimatedMinutes: 5,
      recurrence: { unit: 'day', interval: 1 },
    }),
  })
  const { task } = await r.json()
  return task.id
})
// The backlog tab is status-homogeneous, so every row carries the same
// trailing controls — any edge split would be the badge's fault.
await page.goto(`${BASE}/dashboard?tab=backlog`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Tasks"]')
const recurAlign = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('ul[aria-label="Tasks"] > li')]
  const edges = rows.map((li) =>
    Math.round(li.querySelector('span.tabular-nums')?.getBoundingClientRect().right ?? -1),
  )
  const hasProbe = rows.some((li) => /e2e recur align probe/i.test(li.textContent || ''))
  return { unique: [...new Set(edges)], hasProbe }
})
ok(
  recurAlign.hasProbe && recurAlign.unique.length === 1,
  `#364: mixed recurring/plain rows share one min/pts right edge (edges: ${recurAlign.unique.join(', ')})`,
)
// The badge renders ONLY on the recurring row (role=img), inline in the title
// cluster (before the min/pts cell); plain rows have no badge markup at all.
const recurBadge = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('ul[aria-label="Tasks"] > li')]
  const probe = rows.find((li) => /e2e recur align probe/i.test(li.textContent || ''))
  const plain = rows.find((li) => !/e2e recur align probe/i.test(li.textContent || ''))
  const badge = probe?.querySelector('[role=img][aria-label=Repeats]')
  const cell = probe?.querySelector('span.tabular-nums')
  return {
    probeImg: !!badge,
    badgeBeforeCell:
      !!badge &&
      !!cell &&
      !!(badge.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING),
    plainRepeat: !!plain?.querySelector('svg.lucide-repeat'),
  }
})
ok(
  recurBadge.probeImg && recurBadge.badgeBeforeCell && !recurBadge.plainRepeat,
  '#364: ↻ only on the recurring row, inline in the title cluster',
)
await page.evaluate(
  (tid) => fetch(`/api/tasks/${tid}`, { method: 'DELETE', credentials: 'include' }),
  recurProbe,
)

await browser.close()
process.exit(done())
