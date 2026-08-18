// Notes scratchpad (#405): the autosave contract — type, wait for the debounce,
// reload and find the text still there — plus the nav entry, the blur flush,
// and the save-on-navigate that makes a Save button unnecessary.
//   node client/e2e/notes.mjs   (or: npm run e2e:notes -w client)
import { launch, login, reporter, sleep, BASE } from './lib.mjs'

const { ok, done } = reporter()
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
await login(page)

const indicator = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[role=status]')]
        .map((el) => el.textContent?.trim())
        .find((t) => t && /saved|saving|unsaved|not saved/i.test(t)) ?? '',
  )
const field = () => page.$eval('textarea[aria-label="Notes"]', (t) => t.value)

// Start from a known state so the assertions below mean what they say.
await page.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' })
await page.evaluate(async () => {
  await fetch('/api/notes', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '' }),
  })
})

// --- the header nav entry (#405: nav, not the avatar menu) -------------------
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' })
ok(
  await page.evaluate(() => {
    const links = [...document.querySelectorAll('header a')].map((a) => a.getAttribute('href'))
    return links.includes('/notes') && links.indexOf('/notes') > links.indexOf('/dashboard')
  }),
  '#405: header nav carries a Notes icon, after Dashboard',
)
await page.click('header a[href="/notes"]')
await page.waitForSelector('textarea[aria-label="Notes"]')
ok(page.url().endsWith('/notes'), '#405: the nav icon lands on /notes')
ok(
  await page.evaluate(() => !!document.querySelector('#app-rail')),
  '#405: /notes renders inside the normal shell (rail present, not a solo surface)',
)
ok((await field()) === '', '#405: a cleared note reads back empty')

// --- autosave on a debounce, then survives a reload -------------------------
const body = `Groceries\n- milk\n\nprobe ${Date.now()}`
await page.click('textarea[aria-label="Notes"]')
await page.keyboard.type(body)
ok(/unsaved/i.test(await indicator()), '#405: typing marks the page unsaved')

let saved = true
try {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[role=status]')].some((el) =>
        /^saved$/i.test(el.textContent?.trim() || ''),
      ),
    { timeout: 6000 },
  )
} catch {
  saved = false
}
ok(saved, '#405: the debounce autosaves and the indicator settles on "Saved"')

await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('textarea[aria-label="Notes"]')
ok((await field()) === body, '#405: the note survives a reload (no Save button pressed)')

// --- flush on the way out ---------------------------------------------------
// Type and navigate away IMMEDIATELY, well inside the debounce window: the
// unmount flush is what has to catch this, and it's the case a scratchpad
// cannot afford to lose.
await page.click('textarea[aria-label="Notes"]')
await page.keyboard.type('\nadded just before leaving')
await page.click('header a[href="/dashboard"]')
await page.waitForSelector('ul[aria-label="Tasks"]')
await sleep(600)
const stored = await page.evaluate(async () => {
  const r = await fetch('/api/notes', { credentials: 'include' })
  return (await r.json()).content
})
ok(
  stored.endsWith('added just before leaving'),
  '#405: navigating away inside the debounce still saves (flush on unmount)',
)

// --- the server is authoritative on length ----------------------------------
const tooLong = await page.evaluate(async () => {
  const r = await fetch('/api/notes', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x'.repeat(100001) }),
  })
  return r.status
})
ok(tooLong === 400, `#405: over-length content is rejected server-side (got ${tooLong})`)

// A note AT the cap in a multi-byte script is ~400 KB of UTF-8 — over the
// default 64 KB body limit (#114), so it must reach the validator via the
// notes-only allowance rather than being refused as abuse (#405).
const bigMultibyte = await page.evaluate(async () => {
  const r = await fetch('/api/notes', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '\u3053'.repeat(100000) }),
  })
  return r.status
})
ok(
  bigMultibyte === 200,
  `#405/#114: a 100k-character multi-byte note is accepted, not 413'd (got ${bigMultibyte})`,
)
// Leave the scratchpad empty rather than 100k characters of filler.
await page.evaluate(async () => {
  await fetch('/api/notes', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '' }),
  })
})

const failures = done()
await browser.close()
process.exit(failures ? 1 : 0)
