// A11y verification harness (#126, preserved by #170). Drives real keyboard,
// focus and ARIA interactions in the system Chrome and asserts what a screen
// reader / keyboard user actually gets — not just "the attribute is present".
//
// Prereq: dev stack up (`npm run dev`) + a verified dev user. Run:
//   node client/e2e/a11y.mjs          (or: npm run e2e:a11y -w client)
//
// This doubles as the worked example for writing new checks: launch(), login(),
// seedTask() from ./lib.mjs; assert via reporter().ok(); process.exit(fail).
import { launch, login, seedTask, reporter, sleep, BASE } from './lib.mjs'

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
ok(skip.exists && /skip to main content/i.test(skip.text || ''), `A11Y-2: skip link present ("${skip.text}")`)
ok(skip.isFirst, 'A11Y-2: skip link is the first tabbable element (before the header nav)')
const skipVisible = await page.evaluate(() => {
  const link = document.querySelector('a[href="#main-content"]')
  link.focus()
  const r = link.getBoundingClientRect()
  return document.activeElement === link && r.width > 1 && r.height > 1
})
ok(skipVisible, 'A11Y-2: skip link is focusable and becomes visible on focus')
await page.click('a[href="#main-content"]')
ok((await page.evaluate(() => document.activeElement?.id)) === 'main-content', 'A11Y-2: activating skip link focuses #main-content')

// ── A11Y-2: RouteFocus moves focus on client-side navigation ─────────────────
// Blur the content target, navigate via a real header link, and confirm focus
// lands back on #main-content (proves RouteFocus fires on a route change).
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.getElementById('main-content')?.blur())
await page.click('a[href="/tasks/new"]')
await page.waitForFunction(() => location.pathname === '/tasks/new', { timeout: 3000 })
await sleep(300)
ok((await page.evaluate(() => document.activeElement?.id)) === 'main-content', 'A11Y-2: client-side route change focuses #main-content')

// ── A11Y-5: Choice radiogroup (roving tabindex + arrow keys) ─────────────────
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
const rg = await page.evaluate(() => {
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
ok(rg.hasGroup && rg.count === 5, `A11Y-5: radiogroup with ${rg.count} radios`)
ok(rg.labelled === 'time-label', 'A11Y-5: radiogroup aria-labelledby the question')
ok(rg.checked === 1, 'A11Y-5: exactly one radio aria-checked')
ok(rg.tabbable === 1, 'A11Y-5: roving tabindex (only checked is tabbable)')
await page.evaluate(() => document.querySelector('[role=radio][aria-checked=true]').focus())
await page.keyboard.press('ArrowRight')
const arrow = await page.evaluate(() => {
  const radios = [...document.querySelectorAll('[role=radio]')]
  return {
    checked: radios.findIndex((r) => r.getAttribute('aria-checked') === 'true'),
    focused: radios.indexOf(document.activeElement),
  }
})
ok(arrow.checked === 1 && arrow.focused === 1, 'A11Y-5: ArrowRight moves checked + focus together')
await page.keyboard.press('ArrowLeft')
ok((await page.evaluate(() => [...document.querySelectorAll('[role=radio]')].findIndex((r) => r.getAttribute('aria-checked') === 'true'))) === 0, 'A11Y-5: ArrowLeft moves selection back')

// ── A11Y-5 table + A11Y-3 inline edit + A11Y-1 toast ─────────────────────────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
await page.waitForSelector('table')
const table = await page.evaluate(() => ({
  caption: document.querySelector('table caption')?.textContent?.trim(),
  captionSrOnly: document.querySelector('table caption')?.classList.contains('sr-only'),
  scoped: [...document.querySelectorAll('th')].every((t) => t.getAttribute('scope') === 'col'),
}))
ok(!!table.caption && table.captionSrOnly, `A11Y-5: table has sr-only <caption> ("${table.caption}")`)
ok(table.scoped, 'A11Y-5: every <th> has scope="col"')

ok((await page.$('tbody td button[aria-label^="Edit "]')) !== null, 'A11Y-3: title cell is a keyboard-reachable <button> with aria-label')
await page.focus('tbody td button[aria-label^="Edit "]')
await page.keyboard.press('Enter')
await page.waitForSelector('input[aria-label="Title"]', { timeout: 3000 }).catch(() => {})
const labels = await page.evaluate(() => ({
  title: !!document.querySelector('input[aria-label="Title"]'),
  effort: !!document.querySelector('select[aria-label="Effort"]'),
  minutes: !!document.querySelector('input[aria-label="Estimated minutes"]'),
  status: !!document.querySelector('select[aria-label="Status"]'),
}))
ok(labels.title && labels.effort && labels.minutes && labels.status, 'A11Y-3: Enter opens inline edit; all 4 inputs aria-labelled')
await page.keyboard.press('Escape')
await sleep(200)
ok(!(await page.$('input[aria-label="Title"]')), 'A11Y-3: Escape cancels inline edit')

await page.evaluate(() => [...document.querySelectorAll('tbody button')].find((b) => b.textContent?.trim() === 'Delete')?.click())
await page.waitForSelector('[role=status][aria-live=polite]', { timeout: 3000 }).catch(() => {})
const toast = await page.evaluate(() => {
  const t = document.querySelector('[role=status][aria-live=polite]')
  return t ? { text: t.textContent?.trim(), atomic: t.getAttribute('aria-atomic') } : null
})
ok(toast && /deleted/i.test(toast.text || '') && toast.atomic === 'true', 'A11Y-1: undo toast is role=status + aria-live=polite + aria-atomic')
// pause-on-focus: focus Undo, wait past the 5s window → still there
await page.focus('[role=status] button')
await sleep(6500)
ok((await page.$('[role=status]')) !== null, 'A11Y-1: toast persists past 5s while Undo is focused (pause-on-focus)')
await page.evaluate(() => document.activeElement?.blur())
await sleep(6000)
ok((await page.$('[role=status]')) === null, 'A11Y-1: after blur the timer resumes and the toast dismisses')

// ── A11Y-2 Completion focus + A11Y-4 milestone announcer ─────────────────────
const taskId = await page.evaluate(async () => {
  const r = await fetch('/api/tasks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Complete probe', complexity: 'high', estimatedMinutes: 30 }) })
  const { task } = await r.json()
  await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })
  return task.id
})
await page.goto(`${BASE}/play/progress/${taskId}`, { waitUntil: 'networkidle0' })
const milestone = await page.evaluate(() => {
  const sr = [...document.querySelectorAll('[role=status]')].find((r) => r.className.includes('sr-only'))
  return { present: !!sr, text: sr?.textContent ?? null }
})
ok(milestone.present && milestone.text === '', 'A11Y-4: InProgress sr-only milestone announcer present + empty in the bonus window')
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /complete/i.test(b.textContent || ''))?.click())
await page.waitForFunction(() => /nice work/i.test(document.body.textContent || ''), { timeout: 5000 })
await sleep(200)
const completion = await page.evaluate(() => {
  const h1 = document.querySelector('h1')
  return { focused: document.activeElement === h1, label: h1?.getAttribute('aria-label') }
})
ok(completion.focused, 'A11Y-2: Completion heading is focused on mount')
ok(/complete/i.test(completion.label || '') && /point/i.test(completion.label || ''), `A11Y-2: heading aria-label announces outcome + points ("${completion.label}")`)

const failures = done()
await browser.close()
process.exit(failures ? 1 : 0)
