// Project-colour swatch picker checks (#268/#308): radiogroup semantics +
// roving tabindex in the New-project modal (leading Random cell + 19 swatches),
// and colour round-trips — a picked hue and a Random roll — onto the rail pole.
import { launch, login, reporter, sleep, BASE } from './lib.mjs'

// Slots 0–15 of client/src/lib/projectColors.ts — what Random may roll (#308).
const SPECTRUM_HEXES = [
  '#d11a1a', '#d1511a', '#d1881a', '#bfae18', '#9dbf18', '#66b616', '#16b656',
  '#18bf8d', '#18bfbf', '#188dbf', '#1a63d1', '#3e1ad1', '#751ad1', '#ac1ad1',
  '#d11a88', '#d11a51',
]

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
  (els) =>
    els.map((e) => ({
      checked: e.getAttribute('aria-checked'),
      tab: e.tabIndex,
      label: e.getAttribute('aria-label'),
    })),
)
ok(radios.length === 20, `#308: Random + 19 swatches = 20 radios (got ${radios.length})`)
ok(radios.filter((r) => r.checked === 'true').length === 1, '#268: exactly one swatch checked')
ok(
  radios[0].label === 'Random colour' && radios[0].checked === 'true',
  '#308: the leading Random cell is the default selection on New project',
)
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
// ArrowRight moved us from Random (cell 0) onto Red (palette slot 0).
const name = `Colour probe ${Date.now()}`
await page.type('#project-name', name)
await page.click('button[type="submit"]')
await sleep(600)
const railHasProject = await page.evaluate(
  (n) => [...document.querySelectorAll('#app-rail a')].some((a) => a.textContent.includes(n)),
  name,
)
ok(railHasProject, '#268: new project appears in the rail')
const poleFor = (n) =>
  page.evaluate((needle) => {
    const link = [...document.querySelectorAll('#app-rail a')].find((a) =>
      a.textContent.includes(needle),
    )
    return link?.querySelector('span[aria-hidden]')?.className ?? ''
  }, n)
const poleClass = await poleFor(name)
ok(poleClass.includes('bg-[#d11a1a]'), `#268: rail pole carries slot-0 Red (class: "${poleClass}")`)

// #308: leaving Random selected rolls a concrete SPECTRUM hue at save time —
// the stored colour is a real palette index, never a neutral.
await page.goto(`${BASE}/dashboard?view=projects&new=1`, { waitUntil: 'networkidle0' })
await page.waitForSelector('#project-name', { timeout: 5000 })
const randomName = `Random probe ${Date.now()}`
await page.type('#project-name', randomName)
await page.click('button[type="submit"]')
await sleep(600)
const randomPole = await poleFor(randomName)
ok(
  SPECTRUM_HEXES.some((hex) => randomPole.includes(`bg-[${hex}]`)),
  `#308: Random rolls one of the 16 spectrum hues (class: "${randomPole}")`,
)

await browser.close()
process.exit(done())
