// Play refresh checks (#264): the Choice card structure, and the right-column
// running mirror (live clock + Mark done from the column). Plus #306: options
// with zero possible candidates are hidden — asserted by driving the projects
// option through a deterministic hidden → shown transition.
import { launch, login, reporter, seedTask, sleep, BASE } from './lib.mjs'

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
    time: /how much time do you have/i.test(text),
    radios: document.querySelectorAll('[role=radio]').length,
  }
})
ok(choice.small && choice.big, '#264: both win-type options render')
ok(!choice.projects, '#306: "Focus on projects" hidden with no active-project backlog task')
ok(choice.time && choice.radios === 4, '#264: time chips are the 4-radio radiogroup (fuzzy durations, 2.3.0 review round)')

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
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForFunction(
  () => /working on/i.test(document.querySelector('aside')?.textContent || ''),
  { timeout: 5000 },
)
ok(true, '#264: right column mirrors the running task ("Working on")')
ok(
  await page.evaluate(() => /mirror probe/i.test(document.querySelector('aside')?.textContent || '')),
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
    /nice work|points|done/i.test(document.querySelector('aside [role=status]')?.textContent || ''),
  ),
  '#256r: in-column Mark done shows the card celebration with the reward',
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
await page.click('button[aria-label="Archive this task"]')
await page.waitForSelector('button[aria-label="Archived"]', { timeout: 5000 })
const archived = await page.evaluate(async (tid) => {
  const r = await fetch(`/api/tasks/${tid}`, { credentials: 'include' })
  const { task } = await r.json()
  return task.archivedAt !== null
}, archProbe)
ok(archived, '#312: the shortcut files the just-completed task away (archivedAt set)')

await browser.close()
process.exit(done())
