// Run every e2e suite in sequence and summarise (#437).
//
// Each suite is a standalone script that exits with its failure count, so this
// just spawns them one at a time — sequentially, never in parallel: they share
// one dev user and one database, and concurrent runs would fight over seeded
// state (and trip the #80 login rate limiter that much faster).
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearRateLimits } from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const skip = new Set(['all.mjs', 'lib.mjs'])
const suites = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && !skip.has(f))
  .sort()

// Ten suites means ten logins; without this a back-to-back run trips the #80
// limiter and every suite fails at the login form instead of at an assertion.
clearRateLimits()

const failed = []
for (const suite of suites) {
  console.log(`\n\x1b[36m===\x1b[0m ${suite}`)
  const { status } = spawnSync(process.execPath, [join(here, suite)], { stdio: 'inherit' })
  if (status !== 0) failed.push(suite)
}

console.log(`\n\x1b[36m===\x1b[0m ${suites.length - failed.length}/${suites.length} suites passed`)
if (failed.length) console.log(`failing: ${failed.join(', ')}`)
process.exit(failed.length ? 1 : 0)
