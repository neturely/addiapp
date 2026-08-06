// User-defined task categories (#276; management moved to the rail, #336):
// the rail entries (indented, with the inline edit affordance), the
// New-category modal (rail plus → ?newCategory=1), the per-category filter
// (toolbar Edit/Delete GONE — edit deep-links ?category=ID&editCategory=1,
// Delete lives inside that modal), the tinted row chip, the TaskView Category
// select, and the Play Choice "From" scope. Cleans up after itself.
import { launch, login, reporter, seedTask, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

const CAT_NAME = `e2e-cat-${Date.now()}`

// Rail (#334): NO separate Categories section — entries live in the Tasks
// section under Ready, followed by the "New category" row, before Started.
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
const rail = await page.evaluate(() => {
  const links = [...document.querySelectorAll('#app-rail a')].map((a) => ({
    text: a.textContent?.trim() || '',
    href: a.getAttribute('href') || '',
  }))
  return {
    hasCategoriesHead: links.some((l) => l.text === 'Categories'),
    readyIdx: links.findIndex((l) => l.href === '/dashboard?tab=backlog'),
    newCatIdx: links.findIndex((l) => l.href === '/dashboard?newCategory=1'),
    startedIdx: links.findIndex((l) => l.href === '/dashboard?tab=in_progress'),
  }
})
ok(
  !rail.hasCategoriesHead &&
    rail.readyIdx >= 0 &&
    rail.readyIdx < rail.newCatIdx &&
    rail.newCatIdx < rail.startedIdx,
  `#334: categories live under Ready in the Tasks section (Ready@${rail.readyIdx} < New category@${rail.newCatIdx} < Started@${rail.startedIdx}, no Categories head)`,
)

await page.goto(`${BASE}/dashboard?newCategory=1`, { waitUntil: 'networkidle0' })
await page.waitForSelector('[role=dialog] #category-name', { timeout: 5000 })
await page.type('#category-name', CAT_NAME)
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
// #336: the row chip carries the category's palette tint (inline background)
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
ok(v2Bits.chip, '#336: row category chip carries the palette tint')
ok(v2Bits.toolbarBtns === 0, '#336: toolbar Edit/Delete controls are gone')
// The count is the trailing tabular-nums span, NOT the (digit-bearing) name.
const railCount = await page.evaluate((name) => {
  const link = [...document.querySelectorAll('#app-rail a')].find((a) =>
    a.textContent?.includes(name),
  )
  return link?.querySelector('span.tabular-nums')?.textContent?.trim() ?? null
}, CAT_NAME)
ok(railCount === '1', `#276: rail entry carries the remaining count (got ${railCount})`)

// TaskView: the Category select exists and reflects the assignment.
await page.goto(`${BASE}/tasks/${taskId}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('#task-category', { timeout: 5000 })
ok(
  (await page.$eval('#task-category', (s) => s.value)) === String(categoryId),
  '#276: TaskView Category select shows the assigned category',
)

// Play Choice: the "From" category scope renders and carries into the URL.
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle0' })
await page.waitForSelector('#play-category', { timeout: 5000 })
await page.select('#play-category', String(categoryId))
await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .find((b) => /get small tasks done/i.test(b.textContent || ''))
    ?.click(),
)
await page.waitForFunction(
  (catId) => window.location.search.includes(`category=${catId}`),
  { timeout: 5000 },
  categoryId,
)
ok(true, '#276: Choice "From" scope carries category= into the Play chain')

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
  [...document.querySelectorAll('[role=dialog] button')]
    .find((b) => /delete this category…/i.test(b.textContent || ''))
    ?.click(),
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
