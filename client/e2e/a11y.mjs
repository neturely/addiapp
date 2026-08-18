// A11y verification harness (#126, preserved by #170). Drives real keyboard,
// focus and ARIA interactions in the system Chrome and asserts what a screen
// reader / keyboard user actually gets — not just "the attribute is present".
//
// Prereq: dev stack up (`npm run dev`) + a verified dev user. Run:
//   node client/e2e/a11y.mjs          (or: npm run e2e:a11y -w client)
//
// This doubles as the worked example for writing new checks: launch(), login(),
// seedTask() from ./lib.mjs; assert via reporter().ok(); process.exit(fail).
import {
  backdateTask,
  launch,
  login,
  seedTask,
  reporter,
  resetDailyStats,
  sleep,
  BASE,
} from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()

// ── A11Y-4: role=alert on a bad login (public page) ──────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
await page.type('input[type=email]', 'demo@addiapp.local')
await page.type('input[type=password]', 'definitely-wrong')
await page.click('button[type=submit]')
await page.waitForSelector('p[role=alert]', { timeout: 5000 }).catch(() => {})
ok((await page.$('p[role=alert]')) !== null, 'A11Y-4: bad-login error has role="alert"')

// ── log in + seed a task ─────────────────────────────────────────────────────
await login(page)
await seedTask(page, 'A11y probe task')

// ── A11Y-2: skip link ────────────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
const skip = await page.evaluate(() => {
  const link = document.querySelector('a[href="#main-content"]')
  const tabbables = [
    ...document.querySelectorAll('a[href],button:not([disabled]),input,select,[tabindex="0"]'),
  ].filter((el) => el.tabIndex >= 0)
  return { exists: !!link, text: link?.textContent?.trim(), isFirst: tabbables[0] === link }
})
ok(
  skip.exists && /skip to main content/i.test(skip.text || ''),
  `A11Y-2: skip link present ("${skip.text}")`,
)
ok(skip.isFirst, 'A11Y-2: skip link is the first tabbable element (before the header nav)')
const skipVisible = await page.evaluate(() => {
  const link = document.querySelector('a[href="#main-content"]')
  link.focus()
  const r = link.getBoundingClientRect()
  return document.activeElement === link && r.width > 1 && r.height > 1
})
ok(skipVisible, 'A11Y-2: skip link is focusable and becomes visible on focus')
await page.click('a[href="#main-content"]')
ok(
  (await page.evaluate(() => document.activeElement?.id)) === 'main-content',
  'A11Y-2: activating skip link focuses #main-content',
)

// ── A11Y-2: RouteFocus moves focus on client-side navigation ─────────────────
// Blur the content target, navigate via a real header link, and confirm focus
// lands back on #main-content (proves RouteFocus fires on a route change).
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.getElementById('main-content')?.blur())
await page.click('a[href="/tasks/new"]')
await page.waitForFunction(() => location.pathname === '/tasks/new', { timeout: 3000 })
await sleep(300)
ok(
  (await page.evaluate(() => document.activeElement?.id)) === 'main-content',
  'A11Y-2: client-side route change focuses #main-content',
)

// ── A11Y-5: Choice launchers are plain buttons (#324 review rounds) ──────────
// The time selections are direct launch chips inside the option rows, so they
// must be keyboard-reachable <button>s — not radios. (The only radiogroup left
// on Choice is the category FILTER row, whose roving semantics are covered in
// categories.mjs; the radiogroup pattern is also covered by the effort group
// below.)
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
const launchers = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('main button')]
  return {
    timeRadios: ['A little time', 'A few hours', 'A day', 'Any time'].filter((label) =>
      [...document.querySelectorAll('[role=radio]')].some((r) => r.textContent?.trim() === label),
    ).length,
    chipsAreButtons: ['A little time', 'A few hours', 'A day', 'Any time'].every((label) =>
      buttons.some((b) => b.textContent?.trim() === label),
    ),
  }
})
ok(launchers.timeRadios === 0, 'A11Y-5: time launch chips carry no radio semantics')
ok(launchers.chipsAreButtons, 'A11Y-5: every time launch chip is a real <button>')

// ── A11Y-5: task-create effort radiogroup (#197; /tasks/new = TaskView since
// the #256 review round removed the AddTask page) ────────────────────────────
await page.goto(`${BASE}/tasks/new`, { waitUntil: 'networkidle0' })
const eg = await page.evaluate(() => {
  const group = document.querySelector('[role=radiogroup]')
  const radios = [...document.querySelectorAll('[role=radio]')]
  return {
    hasGroup: !!group,
    labelled: group?.getAttribute('aria-labelledby'),
    count: radios.length,
    checked: radios.filter((r) => r.getAttribute('aria-checked') === 'true').length,
    tabbable: radios.filter((r) => r.getAttribute('tabindex') === '0').length,
  }
})
ok(eg.hasGroup && eg.count === 3, `A11Y-5: effort radiogroup with ${eg.count} radios`)
ok(
  eg.labelled === 'task-difficulty-label',
  'A11Y-5: effort radiogroup aria-labelledby the question',
)
ok(eg.checked === 1, 'A11Y-5: effort — exactly one radio aria-checked')
ok(eg.tabbable === 1, 'A11Y-5: effort — roving tabindex (only checked is tabbable)')
// default selection is Medium (index 1); ArrowRight → High (index 2)
await page.evaluate(() => document.querySelector('[role=radio][aria-checked=true]').focus())
await page.keyboard.press('ArrowRight')
const earrow = await page.evaluate(() => {
  const radios = [...document.querySelectorAll('[role=radio]')]
  return {
    checked: radios.findIndex((r) => r.getAttribute('aria-checked') === 'true'),
    focused: radios.indexOf(document.activeElement),
  }
})
ok(
  earrow.checked === 2 && earrow.focused === 2,
  'A11Y-5: effort — ArrowRight moves checked + focus together',
)

// ── A11Y-5 task list + A11Y-3 open-in-place view + A11Y-1 dialog (#262) ──────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Tasks"]')
ok(
  (await page.$('ul[aria-label="Tasks"] button[aria-label^="Open "]')) !== null,
  'A11Y-5: rows are keyboard-reachable buttons with aria-labels',
)

// Enter on a row opens the task in place.
await page.focus('ul[aria-label="Tasks"] button[aria-label^="Open "]')
await page.keyboard.press('Enter')
await page.waitForFunction(() => /^\/tasks\/\d+$/.test(location.pathname), { timeout: 3000 })
await page.waitForSelector('input[aria-label="Title"]', { timeout: 3000 })
const fields = await page.evaluate(() => {
  const seg = document.querySelector('[role=radiogroup][aria-labelledby="task-difficulty-label"]')
  const radios = [...(seg?.querySelectorAll('[role=radio]') ?? [])]
  const labelled = (id) => {
    const el = document.getElementById(id)
    return !!el && !!document.querySelector(`label[for="${id}"]`)
  }
  return {
    title: !!document.querySelector('input[aria-label="Title"]'),
    project: labelled('task-project'),
    minutes: labelled('task-minutes'),
    status: labelled('task-status'),
    description: labelled('task-description'),
    segRadios: radios.length,
    segChecked: radios.filter((r) => r.getAttribute('aria-checked') === 'true').length,
    segTabbable: radios.filter((r) => r.getAttribute('tabindex') === '0').length,
  }
})
ok(
  fields.title && fields.project && fields.minutes && fields.status && fields.description,
  'A11Y-3: task view — every field is labelled (title/project/minutes/status/description)',
)
ok(
  fields.segRadios === 3 && fields.segChecked === 1 && fields.segTabbable === 1,
  'A11Y-3: difficulty segment is a roving-tabindex radiogroup',
)

// Save fires the shared toast (role=status + aria-live + atomic).
await page.click('button[type="submit"]')
await page.waitForSelector('[role=status][aria-live=polite]', { timeout: 3000 }).catch(() => {})
const saveToast = await page.evaluate(() => {
  const t = document.querySelector('[role=status][aria-live=polite]')
  return t ? { text: t.textContent?.trim(), atomic: t.getAttribute('aria-atomic') } : null
})
ok(
  saveToast && /saved/i.test(saveToast.text || '') && saveToast.atomic === 'true',
  'A11Y-1: Save toast is role=status + aria-live=polite + aria-atomic',
)

// Delete opens the shared Modal: dialog semantics, Escape closes + returns focus.
// Focus the trigger before activating (as a real keyboard/mouse user would) so
// the Modal's return-focus has a real opener to go back to.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Delete')
  b?.focus()
  b?.click()
})
await page.waitForSelector('[role=dialog]', { timeout: 3000 })
const dialog = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]')
  return {
    modal: d?.getAttribute('aria-modal') === 'true',
    labelled: !!d?.getAttribute('aria-labelledby'),
    focusInside: d?.contains(document.activeElement) ?? false,
  }
})
ok(dialog.modal && dialog.labelled, 'A11Y-1: delete dialog is role=dialog + aria-modal + labelled')
ok(dialog.focusInside, 'A11Y-1: initial focus moves into the delete dialog')
await page.keyboard.press('Escape')
await sleep(200)
ok((await page.$('[role=dialog]')) === null, 'A11Y-1: Escape closes the delete dialog')
ok(
  await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Delete'),
  'A11Y-1: focus returns to the Delete trigger on close',
)

// ── A11Y-2 Completion focus + A11Y-4 milestone announcer ─────────────────────
const taskId = await page.evaluate(async () => {
  const r = await fetch('/api/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Complete probe', complexity: 'high', estimatedMinutes: 30 }),
  })
  const { task } = await r.json()
  await fetch(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' }),
  })
  return task.id
})
// #383/#400: a task completed seconds after creation scores 0 (`too_fast`) and
// renders the calm "Done." Completion, not the celebratory one — age it and
// clear today's caps so this exercises the REAL award path it was written for.
// Only 2 minutes: past the 1-minute floor so it scores, but well inside the
// speed-bonus window the milestone announcer below asserts on.
backdateTask(taskId, 2)
resetDailyStats()
await page.goto(`${BASE}/play/progress/${taskId}`, { waitUntil: 'networkidle0' })
const milestone = await page.evaluate(() => {
  const sr = [...document.querySelectorAll('[role=status]')].find((r) =>
    r.className.includes('sr-only'),
  )
  return { present: !!sr, text: sr?.textContent ?? null }
})
ok(
  milestone.present && milestone.text === '',
  'A11Y-4: InProgress sr-only milestone announcer present + empty in the bonus window',
)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /mark done/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(() => /nice work/i.test(document.body.textContent || ''), {
  timeout: 5000,
})
await sleep(200)
const completion = await page.evaluate(() => {
  const h1 = document.querySelector('h1')
  return { focused: document.activeElement === h1, label: h1?.getAttribute('aria-label') }
})
ok(completion.focused, 'A11Y-2: Completion heading is focused on mount')
ok(
  /complete/i.test(completion.label || '') && /point/i.test(completion.label || ''),
  `A11Y-2: heading aria-label announces outcome + points ("${completion.label}")`,
)

// ── A11Y-6: friendly copy on an unexpected failure (#415) ────────────────────
// Force a 500 on the save PATCH and assert the danger toast carries the shared
// friendly copy — the raw "Internal server error" body must never render.
const probe500 = await seedTask(page, 'Friendly-error probe')
await page.goto(`${BASE}/tasks/${probe500}`, { waitUntil: 'networkidle0' })
await page.setRequestInterception(true)
const force500 = (req) => {
  if (req.method() === 'PATCH' && req.url().includes('/api/tasks/')) {
    void req.respond({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' }),
    })
  } else void req.continue()
}
page.on('request', force500)
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /save changes/i.test(b.textContent || ''))
    ?.click(),
)
await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll('[role=status]')].some((el) =>
        /something went wrong on our side/i.test(el.textContent || ''),
      ),
    { timeout: 5000 },
  )
  .catch(() => {})
const friendly = await page.evaluate(() => ({
  toast: [...document.querySelectorAll('[role=status]')].some((el) =>
    /something went wrong on our side/i.test(el.textContent || ''),
  ),
  raw: /internal server error/i.test(document.body.textContent || ''),
}))
ok(friendly.toast, 'A11Y-6: a 500 on save surfaces the friendly danger toast (#415)')
ok(!friendly.raw, 'A11Y-6: the raw "Internal server error" string never renders (#415)')
page.off('request', force500)
await page.setRequestInterception(false)

const failures = done()
await browser.close()
process.exit(failures ? 1 : 0)
