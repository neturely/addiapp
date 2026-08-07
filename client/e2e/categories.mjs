// User-defined task categories (#276; management moved to the rail, #336):
// the rail entries (indented, with the inline edit affordance), the
// New-category modal (rail plus → ?newCategory=1), the per-category filter
// (toolbar Edit/Delete GONE — edit deep-links ?category=ID&editCategory=1,
// Delete lives inside that modal), the tinted row chip, the TaskView Category
// select, and the Play Choice category chip row (#324). Cleans up after itself.
import { launch, login, reporter, seedTask, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

const CAT_NAME = `e2e-cat-${Date.now()}`

// Rail (#336, final round): Categories has its OWN section between Tasks and
// Projects — a plain (non-link) head with the + → ?newCategory=1; the old
// "+ New category" row is gone. The Tasks section keeps the axes grouped
// under Ready (Recurring, Unassigned) with Started after.
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
const rail = await page.evaluate(() => {
  const links = [...document.querySelectorAll('#app-rail a')].map((a) => ({
    text: a.textContent?.trim() || '',
    href: a.getAttribute('href') || '',
  }))
  const heads = [...document.querySelectorAll('#app-rail > div.mb-1')].map((d) =>
    (d.textContent || '').trim(),
  )
  return {
    hasCategoriesHead: heads.some((h) => h.startsWith('Categories')),
    newCatRow: links.some((l) => l.text === 'New category'),
    plusIdx: links.findIndex((l) => l.href === '/dashboard?newCategory=1'),
    readyIdx: links.findIndex((l) => l.href === '/dashboard?tab=backlog'),
    recurringIdx: links.findIndex((l) => l.href === '/dashboard?tab=recurring'),
    unassignedIdx: links.findIndex((l) => l.href === '/dashboard?tab=unassigned'),
    startedIdx: links.findIndex((l) => l.href === '/dashboard?tab=in_progress'),
    archivedIdx: links.findIndex((l) => l.href === '/dashboard?tab=archived'),
  }
})
ok(
  rail.hasCategoriesHead && !rail.newCatRow && rail.plusIdx > rail.archivedIdx,
  `#336: Categories has its own section after Tasks (head + plus@${rail.plusIdx} > Archived@${rail.archivedIdx}; no "+ New category" row)`,
)
ok(
  rail.readyIdx >= 0 &&
    rail.readyIdx < rail.recurringIdx &&
    rail.recurringIdx < rail.unassignedIdx &&
    rail.unassignedIdx < rail.startedIdx,
  `#336: Tasks axes order Ready@${rail.readyIdx} < Recurring@${rail.recurringIdx} < Unassigned@${rail.unassignedIdx} < Started@${rail.startedIdx}`,
)

await page.goto(`${BASE}/dashboard?newCategory=1`, { waitUntil: 'networkidle0' })
await page.waitForSelector('[role=dialog] #category-name', { timeout: 5000 })
await page.type('#category-name', CAT_NAME)
// #336: categories carry an optional description (the projects shape).
await page.type('#category-description', 'e2e description probe')
await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /create category/i.test(b.textContent || ''))
    ?.click(),
)
// Saving navigates to the new category's filter view.
await page.waitForFunction(() => /[?&]category=\d+/.test(window.location.search), {
  timeout: 5000,
})
ok(true, '#276: New-category modal creates and lands on the category filter')
const categoryId = Number(new URL(page.url()).searchParams.get('category'))

// Assign a seeded task via the API, then verify the filtered list + rail entry.
const taskId = await seedTask(page, `e2e categorized ${Date.now()}`)
await page.evaluate(
  async (id, catId) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: catId }),
    })
  },
  taskId,
  categoryId,
)
await page.goto(`${BASE}/dashboard?category=${categoryId}`, { waitUntil: 'networkidle0' })
const filtered = await page.evaluate(() =>
  [...document.querySelectorAll('ul[aria-label="Tasks"] li')].map((li) => li.textContent || ''),
)
ok(
  filtered.length === 1 && /e2e categorized/.test(filtered[0]),
  `#276: ?category= filter shows exactly the labelled task (got ${filtered.length})`,
)
// #336: on the category's OWN filter view the chip is redundant and hidden,
// and the toolbar's old Edit/Delete controls are gone.
const v2Bits = await page.evaluate(() => {
  const li = document.querySelector('ul[aria-label="Tasks"] li')
  const chip = [...(li?.querySelectorAll('span') ?? [])].find((s) =>
    (s.getAttribute('style') || '').includes('background'),
  )
  const toolbarBtns = [...document.querySelectorAll('main button')].filter((b) =>
    ['Edit', 'Delete'].includes(b.textContent?.trim() || ''),
  ).length
  return { chip: !!chip, toolbarBtns }
})
ok(!v2Bits.chip, '#336: no category chip on the category’s own filter view')
ok(v2Bits.toolbarBtns === 0, '#336: toolbar Edit/Delete controls are gone')
// …while mixed views (All tasks) show the chip in the category's palette tint,
// and the rail entry leads with the coloured TAG icon (not a pole square).
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
const allView = await page.evaluate((name) => {
  const li = [...document.querySelectorAll('ul[aria-label="Tasks"] li')].find((el) =>
    /e2e categorized/i.test(el.textContent || ''),
  )
  const chip = [...(li?.querySelectorAll('span') ?? [])].find((s) =>
    (s.getAttribute('style') || '').includes('background'),
  )
  const railEntry = [...document.querySelectorAll('#app-rail a')].find((a) =>
    a.textContent?.includes(name),
  )
  return { chip: !!chip, tagIcon: !!railEntry?.querySelector('svg.lucide-tag') }
}, CAT_NAME)
ok(allView.chip, '#336: All-tasks row chip carries the palette tint')
ok(allView.tagIcon, '#336: rail category entry leads with the tag icon')
// The count is the trailing tabular-nums span, NOT the (digit-bearing) name.
const railCount = await page.evaluate((name) => {
  const link = [...document.querySelectorAll('#app-rail a')].find((a) =>
    a.textContent?.includes(name),
  )
  return link?.querySelector('span.tabular-nums')?.textContent?.trim() ?? null
}, CAT_NAME)
ok(railCount === '1', `#276: rail entry carries the remaining count (got ${railCount})`)

// #336: the Categories heading links the categories VIEW — a Dashboard-style
// row list (tag icon · name + description · count · trailing pencil); a row
// opens the category's task list.
const headHref = await page.evaluate(() => {
  const a = [...document.querySelectorAll('#app-rail a')].find(
    (el) => el.textContent?.trim() === 'Categories',
  )
  return a?.getAttribute('href') ?? null
})
ok(headHref === '/dashboard?view=categories', `#336: Categories head links the view (got ${headHref})`)
await page.goto(`${BASE}/dashboard?view=categories`, { waitUntil: 'networkidle0' })
await page.waitForSelector('ul[aria-label="Categories"]', { timeout: 5000 })
const catRow = await page.evaluate((name) => {
  const li = [...document.querySelectorAll('ul[aria-label="Categories"] li')].find((el) =>
    (el.textContent || '').includes(name),
  )
  if (!li) return null
  return {
    text: li.textContent || '',
    hasOpen: !!li.querySelector('button[aria-label^="Open "]'),
    hasPencil: !!li.querySelector('button[aria-label^="Edit category"]'),
    hasTag: !!li.querySelector('svg.lucide-tag'),
  }
}, CAT_NAME)
ok(
  catRow !== null &&
    /e2e description probe/.test(catRow.text) &&
    catRow.hasOpen &&
    catRow.hasPencil &&
    catRow.hasTag,
  '#336: categories-view row = tag icon + name + description + open + pencil',
)
await page.evaluate(
  (name) =>
    [...document.querySelectorAll('button[aria-label^="Open "]')]
      .find((b) => (b.getAttribute('aria-label') || '').includes(name))
      ?.click(),
  CAT_NAME,
)
await page.waitForFunction(
  (id) => window.location.search.includes(`category=${id}`),
  { timeout: 5000 },
  categoryId,
)
ok(true, "#336: view row opens the category's task list")

// TaskView: the Category select exists and reflects the assignment.
await page.goto(`${BASE}/tasks/${taskId}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('#task-category', { timeout: 5000 })
ok(
  (await page.$eval('#task-category', (s) => s.value)) === String(categoryId),
  '#276: TaskView Category select shows the assigned category',
)

// Play Choice (#324, round-3 shape — the category chips are a FILTER row
// under the heading, not an option): "Any category" default, tinted tabs,
// roving-tabindex radiogroup; a picked category scopes whichever option
// launches below.
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
await page.waitForSelector('[role=radiogroup][aria-label="Category filter"]', { timeout: 5000 })
const filterRow = await page.evaluate((name) => {
  const chips = [
    ...document.querySelectorAll('[role=radiogroup][aria-label="Category filter"] [role=radio]'),
  ]
  const any = chips[0]
  const mine = chips.find((c) => c.textContent?.trim() === name)
  return {
    defaultAny:
      any?.textContent?.trim() === 'Any category' &&
      any?.getAttribute('aria-checked') === 'true',
    tinted: !!mine && (mine.getAttribute('style') || '').includes('background'),
  }
}, CAT_NAME)
ok(filterRow.defaultAny, '#324: filter row defaults to "Any category" (checked)')
ok(filterRow.tinted, '#324: category filter chip carries the palette tint')
// Arrow-key roving moves selection AND focus together (the radio pattern).
await page.evaluate(() =>
  document.querySelector('[aria-label="Category filter"] [role=radio]')?.focus(),
)
await page.keyboard.press('ArrowRight')
const roved = await page.evaluate(() => {
  const el = document.activeElement
  return el?.getAttribute('role') === 'radio' && el.getAttribute('aria-checked') === 'true'
    ? el.textContent?.trim()
    : null
})
ok(
  roved !== null && roved !== 'Any category',
  `#324: arrow key roves selection + focus (got ${roved})`,
)
// A picked category + a time chip below composes size + category in the URL.
await page.evaluate((name) => {
  ;[...document.querySelectorAll('[aria-label="Category filter"] [role=radio]')]
    .find((c) => c.textContent?.trim() === name)
    ?.click()
}, CAT_NAME)
await page.evaluate(() =>
  [...document.querySelectorAll('main button')]
    .find((b) => b.textContent?.trim() === 'A little time')
    ?.click(),
)
await page.waitForFunction(
  (catId) =>
    window.location.pathname === '/play/task' &&
    window.location.search.includes('size=small') &&
    window.location.search.includes(`category=${catId}`),
  { timeout: 5000 },
  categoryId,
)
ok(true, '#324: filter + launch chip compose size= and category= in the Play chain')

// Management via the rail (#336): the entry carries an inline edit affordance
// deep-linking ?category=ID&editCategory=1; Delete lives inside the modal and
// hands off to the confirm step. (Doubles as the cleanup — tasks survive.)
await page.goto(`${BASE}/dashboard?category=${categoryId}`, { waitUntil: 'networkidle0' })
const editHref = await page.evaluate((name) => {
  const a = [...document.querySelectorAll('#app-rail a[aria-label^="Edit category"]')].find((el) =>
    (el.getAttribute('aria-label') || '').includes(name),
  )
  return a?.getAttribute('href') ?? null
}, CAT_NAME)
ok(
  editHref === `/dashboard?category=${categoryId}&editCategory=1`,
  `#336: rail entry carries the edit affordance (got ${editHref})`,
)
await page.goto(`${BASE}${editHref}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('[role=dialog] #category-name', { timeout: 5000 })
ok(
  await page.evaluate(
    (name) => document.querySelector('#category-name')?.value === name,
    CAT_NAME,
  ),
  '#336: edit deep link opens the modal prefilled',
)
await page.evaluate(() =>
  document.querySelector('[role=dialog] button[aria-label="Delete this category"]')?.click(),
)
await page.waitForFunction(
  () => /delete this category\?/i.test(document.querySelector('[role=dialog] h2')?.textContent || ''),
  { timeout: 5000 },
)
ok(true, '#336: modal Delete hands off to the confirm step')
await page.evaluate(() =>
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /^delete category$/i.test(b.textContent?.trim() || ''))
    ?.click(),
)
await page.waitForFunction(() => !window.location.search.includes('category='), { timeout: 5000 })
const taskSurvives = await page.evaluate(async (id) => {
  const r = await fetch(`/api/tasks/${id}`, { credentials: 'include' })
  if (!r.ok) return false
  const { task } = await r.json()
  return task.categoryId === null
}, taskId)
ok(taskSurvives, '#276: deleting the category keeps the task, unlabelled')
await page.evaluate(
  async (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' }),
  taskId,
)
await sleep(200)

await browser.close()
process.exit(done())
