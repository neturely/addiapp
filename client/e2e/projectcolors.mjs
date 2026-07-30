// Project-colour swatch picker checks (#268): radiogroup semantics + roving
// tabindex in the New-project modal, and a colour round-trip onto the rail pole.
import { launch, login, reporter, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

await page.goto(`${BASE}/dashboard?view=projects&new=1`, { waitUntil: 'networkidle0' })
await page.waitForSelector('[role="radiogroup"][aria-labelledby="project-color-label"]', {
  timeout: 5000,
})

const radios = await page.$$eval(
  '[aria-labelledby="project-color-label"] [role="radio"]',
  (els) => els.map((e) => ({ checked: e.getAttribute('aria-checked'), tab: e.tabIndex })),
)
ok(radios.length === 20, `#268: swatch radiogroup has 20 radios (got ${radios.length})`)
ok(radios.filter((r) => r.checked === 'true').length === 1, '#268: exactly one swatch checked')
ok(
  radios.every((r) => (r.checked === 'true' ? r.tab === 0 : r.tab === -1)),
  '#268: roving tabindex — only the checked swatch is tabbable',
)

// Arrow key moves selection + focus together.
await page.focus('[aria-labelledby="project-color-label"] [role="radio"][aria-checked="true"]')
await page.keyboard.press('ArrowRight')
await sleep(100)
const after = await page.evaluate(() => {
  const els = [
    ...document.querySelectorAll('[aria-labelledby="project-color-label"] [role="radio"]'),
  ]
  return {
    checkedIndex: els.findIndex((e) => e.getAttribute('aria-checked') === 'true'),
    focusedIndex: els.indexOf(document.activeElement),
  }
})
ok(after.checkedIndex === 1, '#268: ArrowRight moves the checked swatch')
ok(after.focusedIndex === after.checkedIndex, '#268: focus follows the selection')

// Round-trip: create a project with the selected colour → rail pole shows it.
const name = `Colour probe ${Date.now()}`
await page.type('#project-name', name)
await page.click('button[type="submit"]')
await sleep(600)
const railHasProject = await page.evaluate(
  (n) => [...document.querySelectorAll('#app-rail a')].some((a) => a.textContent.includes(n)),
  name,
)
ok(railHasProject, '#268: new project appears in the rail')
const poleClass = await page.evaluate((n) => {
  const link = [...document.querySelectorAll('#app-rail a')].find((a) => a.textContent.includes(n))
  return link?.querySelector('span[aria-hidden]')?.className ?? ''
}, name)
ok(/bg-success/.test(poleClass), `#268: rail pole carries slot-1 colour (class: "${poleClass}")`)

await browser.close()
process.exit(done())
