// Play refresh checks (#264): the Choice card structure, and the right-column
// running mirror (live clock + Mark done from the column). Plus #306: options
// with zero possible candidates are hidden — asserted by driving the projects
// option through a deterministic hidden → shown transition.
import { backdateTask, launch, login, reporter, seedTask, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

// #306 seeded state: a backlog task in each pool exists (seed a medium — sits
// in both), and NO backlog task in an ACTIVE project (archive every active
// project; suites recreate their own, so this residue is disposable).
await seedTask(page, 'Choice availability probe', 'medium', 10)
await page.evaluate(async () => {
  const r = await fetch('/api/projects', { credentials: 'include' })
  const { projects } = await r.json()
  for (const p of projects) {
    await fetch(`/api/projects/${p.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
  }
})

// --- Choice card (projects option hidden — no active-project backlog task) ---
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => /get small tasks done/i.test(document.body.textContent || ''))
await sleep(300) // let the availability fetch resolve and prune
const choice = await page.evaluate(() => {
  const text = document.body.textContent || ''
  return {
    small: /get small tasks done/i.test(text),
    big: /take on bigger issues/i.test(text),
    projects: /focus on projects/i.test(text),
    // #324 review round: the standalone "How much time do you have?" section
    // is GONE — each win-type row carries its own launch chips (short presets
    // on the small row, long/open on the big row).
    timeSection: /how much time do you have/i.test(text),
  }
})
const chipHomes = await page.evaluate(() => {
  const home = (label) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    )
    return btn?.closest('div.rounded-xl')?.textContent || ''
  }
  return {
    little: home('A little time'),
    few: home('A few hours'),
    day: home('A day'),
    any: home('Any time'),
  }
})
ok(choice.small && choice.big, '#264: both win-type options render')
ok(!choice.projects, '#306: "Focus on projects" hidden with no active-project backlog task')
ok(!choice.timeSection, '#324r: the standalone time section is gone')
ok(
  /get small tasks done/i.test(chipHomes.little) && /get small tasks done/i.test(chipHomes.few),
  '#324r: "A little time" + "A few hours" launch chips live in the small row',
)
ok(
  /take on bigger issues/i.test(chipHomes.day) && /take on bigger issues/i.test(chipHomes.any),
  '#324r: "A day" + "Any time" launch chips live in the big row',
)

// Seed an active project WITH a backlog task → the option comes back.
await page.evaluate(async () => {
  const r = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Availability probe ${Date.now()}` }),
  })
  const { project } = await r.json()
  await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Project availability probe',
      complexity: 'low',
      estimatedMinutes: 5,
      projectId: project.id,
    }),
  })
})
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => /focus on projects/i.test(document.body.textContent || ''), {
  timeout: 5000,
})
ok(true, '#306: "Focus on projects" reappears once a backlog task joins an active project')
ok(
  await page.evaluate(() => /auto-picked/i.test(document.body.textContent || '')),
  '#264: "Auto-picked" tag on the projects option',
)

// --- running mirror ---
const id = await seedTask(page, 'Mirror probe', 'medium', 30)
await page.evaluate(
  (tid) =>
    fetch(`/api/tasks/${tid}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    }),
  id,
)
// #383/#385: age the probe so the completion actually scores — the in-column
// celebration should show the REAL reward panel, not the zero-award note.
backdateTask(id)
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForFunction(
  () => /working on/i.test(document.querySelector('aside')?.textContent || ''),
  { timeout: 5000 },
)
ok(true, '#264: right column mirrors the running task ("Working on")')
ok(
  await page.evaluate(() =>
    /mirror probe/i.test(document.querySelector('aside')?.textContent || ''),
  ),
  '#264: mirror shows the task title',
)
const clock1 = await page.evaluate(
  () => document.querySelector('aside .tabular-nums')?.textContent || '',
)
await sleep(2200)
const clock2 = await page.evaluate(
  () => document.querySelector('aside .tabular-nums')?.textContent || '',
)
ok(clock1 !== clock2, `#264: mirror clock ticks ("${clock1}" → "${clock2}")`)

// Mark done from the column: the card flips into the confetti celebration
// (#256 review — replaced the points toast), then reverts to idle.
await page.evaluate(() =>
  [...document.querySelectorAll('aside button')]
    .find((b) => /mark done/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForSelector('aside [role=status]', { timeout: 5000 })
ok(
  await page.evaluate(() =>
    /\+\d+\s*points/i.test(document.querySelector('aside [role=status]')?.textContent || ''),
  ),
  '#256r/#385: in-column Mark done celebrates with the real "+N points" reward',
)
ok(
  await page.evaluate(() => document.querySelectorAll('aside .animate-confetti').length > 0),
  '#256r: celebration renders the confetti accents',
)
await page.waitForFunction(
  () => /nothing running/i.test(document.querySelector('aside')?.textContent || ''),
  { timeout: 9000 },
)
ok(true, '#264: mirror reverts to the idle Play card after the celebration')

// --- Completion archive shortcut (#312) ---
const archProbe = await seedTask(page, 'Archive shortcut probe', 'low', 10)
await page.evaluate(
  (tid) =>
    fetch(`/api/tasks/${tid}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    }),
  archProbe,
)
await page.goto(`${BASE}/play/progress/${archProbe}`, { waitUntil: 'networkidle0' })
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /mark done/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForSelector('button[aria-label="Archive this task"]', { timeout: 8000 })
ok(true, '#312: Completion shows the archive shortcut beside "Keep going"')
// #385: this probe completes seconds after creation — the award is zeroed
// (too_fast) and the Completion explains itself instead of showing "+0".
ok(
  await page.evaluate(() => /too quick to score/i.test(document.body.textContent || '')),
  '#385: zero-award Completion explains the too-fast rule',
)
ok(
  await page.evaluate(() =>
    [...document.querySelectorAll('a')].some(
      (a) =>
        a.getAttribute('href') === '/how-points-work' &&
        /how points work/i.test(a.textContent || ''),
    ),
  ),
  '#385: the zero-award panel links the guide',
)
// #400: a zeroed completion doesn't celebrate — calm heading ("Done.", not
// "Nice work!") and no confetti decoration.
ok(
  await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    return (
      /Done\./.test(h1?.textContent || '') && !/Nice work/i.test(document.body.textContent || '')
    )
  }),
  '#400: zeroed Completion uses the calm "Done." heading, no cheer',
)
ok(
  await page.evaluate(() => document.querySelectorAll('.animate-confetti').length === 0),
  '#400: zeroed Completion renders no confetti',
)
await page.click('button[aria-label="Archive this task"]')
await page.waitForSelector('button[aria-label="Archived"]', { timeout: 5000 })
const archived = await page.evaluate(async (tid) => {
  const r = await fetch(`/api/tasks/${tid}`, { credentials: 'include' })
  const { task } = await r.json()
  return task.archivedAt !== null
}, archProbe)
ok(archived, '#312: the shortcut files the just-completed task away (archivedAt set)')

// --- #383: points regulation, live ---
// A fresh task one-click-done'd from Ready is too fast to score (the untimed
// loophole is closed); the same task aged past the threshold scores normally.
const completeViaApi = (id) =>
  page.evaluate(async (tid) => {
    const r = await fetch(`/api/tasks/${tid}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    return (await r.json()).pointsAwarded ?? null
  }, id)

const fastId = await seedTask(page, 'Reg fast probe', 'high', 30)
const fastAward = await completeViaApi(fastId)
ok(
  fastAward?.totalPoints === 0 && fastAward?.reason === 'too_fast',
  `#383: instant complete-from-Ready scores 0 with reason too_fast (got ${JSON.stringify(fastAward)})`,
)

const slowId = await seedTask(page, 'Reg slow probe', 'high', 30)
backdateTask(slowId)
const slowAward = await completeViaApi(slowId)
ok(
  (slowAward?.totalPoints ?? 0) > 0 && slowAward?.reason === undefined,
  `#383: an aged task scores normally (got ${JSON.stringify(slowAward)})`,
)

// --- #423: liveness — the 5× auto-return flips the open InProgress screen ---
// A 1-min task backdated 10 min is past the 5× boundary on load: the screen's
// boundary check fetches notifications (running the lazy #403 sweep, which
// performs the return) and flips to the calm "sent back to Ready" card without
// a navigation; the header chip drops the task too.
const overId = await seedTask(page, 'e2e overrun flip probe', 'low', 1)
await page.evaluate(async (i) => {
  await fetch(`/api/tasks/${i}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' }),
  })
}, overId)
backdateTask(overId, 10)
await page.goto(`${BASE}/play/progress/${overId}`, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => /sent back to ready/i.test(document.body.textContent || ''), {
  timeout: 10000,
})
ok(true, '#423: InProgress flips to the "Sent back to Ready" card at the 5× boundary')
ok(
  await page.evaluate(() => document.activeElement?.tagName === 'H1'),
  '#423: the sent-back card focuses its heading (in-place flip, #126)',
)
await sleep(400)
ok(
  await page.evaluate(
    (i) => !document.querySelector(`header a[href="/play/progress/${i}"]`),
    overId,
  ),
  '#423: the chip drops the returned task without a navigation',
)
const returnedRow = await page.evaluate(async () => {
  const { notifications } = await fetch('/api/notifications', { credentials: 'include' }).then(
    (r) => r.json(),
  )
  return (
    notifications.find(
      (n) => n.type === 'task_returned' && /overrun flip probe/i.test(n.data.title || ''),
    ) ?? null
  )
})
ok(returnedRow !== null, '#423: the task_returned notification exists after the flip')

// --- #397: manager-view play buttons land on Choice pre-focused ---
const pin = await page.evaluate(async () => {
  const pr = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'e2e pin probe' }),
  }).then((r) => r.json())
  const pid = pr.project.id
  const tasks = []
  for (const title of ['e2e pin task old', 'e2e pin task new']) {
    const t = await fetch('/api/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, complexity: 'low', estimatedMinutes: 5, projectId: pid }),
    }).then((r) => r.json())
    tasks.push(t.task.id)
  }
  return { pid, tasks }
})
await page.goto(`${BASE}/play?project=${pin.pid}`, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => /focus on e2e pin probe/i.test(document.body.textContent || ''), {
  timeout: 5000,
})
ok(true, '#397: /play?project=ID pre-selects Focus on projects, labelled to the project')
ok(
  await page.evaluate(() => !!document.querySelector('button[aria-label^="Clear project"]')),
  '#397: the pin is clearable (× pill present)',
)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /focus on e2e pin probe/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(
  (pid) =>
    location.pathname === '/play/task' &&
    location.search.includes('mode=projects') &&
    location.search.includes(`project=${pid}`),
  { timeout: 5000 },
  pin.pid,
)
await page.waitForFunction(() => /e2e pin task old/i.test(document.body.textContent || ''), {
  timeout: 5000,
})
ok(
  true,
  "#397: the pinned launch presents the project's OLDEST task (least-effort ranking skipped)",
)
// Cleanup: archive → delete the pin project; its tasks go Unassigned, delete them too.
await page.evaluate(async ({ pid, tasks }) => {
  await fetch(`/api/projects/${pid}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'archived' }),
  })
  await fetch(`/api/projects/${pid}`, { method: 'DELETE', credentials: 'include' })
  for (const id of tasks)
    await fetch(`/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' })
}, pin)

// Cleanup the probes (done tasks would linger in the demo data).
await page.evaluate(
  async (ids) => {
    for (const id of ids)
      await fetch(`/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' })
  },
  [fastId, slowId, overId],
)

await browser.close()
process.exit(done())
