import { useEffect, useState, type ReactNode } from 'react'
import { Flame, Layers, ShieldCheck, Star, Zap } from 'lucide-react'
import { fetchPoints, type PointsStats } from '@/lib/points'
import { fetchUserStats, type UserStats } from '@/lib/points'

/**
 * One guide section: icon chip + heading, hairline-divided from the previous
 * (the Settings surface pattern — the house style for content/info pages).
 */
function Section({
  icon,
  iconClass,
  title,
  first,
  children,
}: {
  icon: ReactNode
  iconClass: string
  title: string
  first?: boolean
  children: ReactNode
}) {
  return (
    <section className={`py-6 ${first ? '' : 'border-t border-field-hover'}`}>
      <div className="mb-2 flex items-center gap-3">
        <span
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${iconClass}`}
        >
          {icon}
        </span>
        <h2 className="font-bold text-gray-800">{title}</h2>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

/**
 * "How points work" (#385, the transparency half of the #292 design): a plain-
 * language walkthrough of the scoring — base points, speed bonus, daily bonus,
 * project bonus — and the fair-play limits, so a zero-point award never reads
 * as a bug. Every number on this page is SERVED (GET /api/points + /stats from
 * PointsConfig — the single-source rule); nothing is hardcoded here.
 *
 * Layout (#385 review round): ONE full-width white surface filling the content
 * pane (the Settings-panel treatment, left-aligned content) — this is the
 * template for future informational pages (user guide #41 etc.), not a bespoke
 * card stack.
 */
export function HowPointsWork() {
  const [points, setPoints] = useState<PointsStats | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchPoints()
      .then((p) => !cancelled && setPoints(p))
      .catch(() => {})
    fetchUserStats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!points) {
    return (
      <main className="flex min-h-screen flex-col p-4 sm:p-6">
        <div className="flex flex-1 items-center justify-center rounded-xl bg-surface text-muted">
          <span role="status">Loading…</span>
        </div>
      </main>
    )
  }

  const { basePoints, speedBonus, limits } = points
  const bonusPct = Math.round(speedBonus.maxRatio * 100)
  const halfPct = Math.round(speedBonus.saturation * 100)
  const budgetHours = Math.round(limits.dailyBudgetMinutes / 60)
  const cap = stats?.multiplier.cap ?? 2
  const capTask = stats?.multiplier.capTaskNumber

  return (
    <main className="flex min-h-screen flex-col p-4 sm:p-6">
      <div className="flex-1 rounded-xl bg-surface px-6 py-8 sm:px-9">
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">How points work</h1>
        <p className="mt-1 text-sm text-muted">
          The short version: finish real tasks, earn points — the harder the task and the better
          your day is going, the more you get.
        </p>

        <div className="mt-2">
          <Section
            first
            icon={<Star className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden />}
            iconClass="bg-warning-tint text-warning-ink"
            title="Every task has base points"
          >
            <p>Points follow the difficulty you give a task:</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-lg bg-success-tint px-3 py-1.5 font-semibold text-success-ink">
                Low +{basePoints.low}
              </span>
              <span className="rounded-lg bg-warning-tint px-3 py-1.5 font-semibold text-warning-ink">
                Medium +{basePoints.medium}
              </span>
              <span className="rounded-lg bg-primary-tint px-3 py-1.5 font-semibold text-primary-ink">
                High +{basePoints.high}
              </span>
            </div>
          </Section>

          <Section
            icon={<Zap className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden />}
            iconClass="bg-success-tint text-success-ink"
            title="Beat your estimate for a speed bonus"
          >
            <p>
              Press <strong>Start</strong>, finish faster than you estimated, and you earn extra —
              up to <strong>+{bonusPct}% of the base points</strong> when you finish in{' '}
              {halfPct}% of the time or less.
            </p>
            <p>
              It&apos;s a one-shot sprint reward: if you send a started task back to Ready, that
              task&apos;s bonus is gone (the base points aren&apos;t — finishing still counts).
            </p>
          </Section>

          <Section
            icon={<Flame className="h-5 w-5" aria-hidden />}
            iconClass="bg-primary-tint text-primary-ink"
            title="Your day builds a bonus"
          >
            <p>
              Each task you finish today is worth a little more than the last — up to{' '}
              <strong>×{cap}</strong>
              {capTask != null && <> from your {capTask}th task onward</>}. It resets at midnight,
              so tomorrow starts fresh.
            </p>
          </Section>

          <Section
            icon={<Layers className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
            iconClass="bg-accent-tint text-accent-ink"
            title="Finish a project, get a bonus"
          >
            <p>
              Completing <em>every</em> task in a project (of {limits.projectBonus.minTasks} tasks
              or more) pays a one-time bonus — bigger projects pay more, from{' '}
              {limits.projectBonus.min} up to {limits.projectBonus.max} points.
            </p>
          </Section>

          <Section
            icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
            iconClass="bg-field text-gray-700"
            title="Fair play: a day can only hold a day"
          >
            <p>
              Points measure real work, so a few honest limits apply — most days you&apos;ll never
              notice them:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                A task finished in under{' '}
                {limits.minScoringMinutes === 1
                  ? 'a minute'
                  : `${limits.minScoringMinutes} minutes`}{' '}
                doesn&apos;t score — that&apos;s quicker than any real task.
              </li>
              <li>
                A day holds up to <strong>{limits.dailyCompletionsCap} scoring tasks</strong> or
                about <strong>{budgetHours} hours</strong> of estimated work — after that, points
                resume tomorrow (finishing still works, and still counts as done).
              </li>
              <li>
                The speed bonus trusts estimates within a sensible range for each difficulty
                (Low {limits.estimateBands.low[0]}–{limits.estimateBands.low[1]} min, Medium{' '}
                {limits.estimateBands.medium[0]}–{limits.estimateBands.medium[1]} min, High{' '}
                {limits.estimateBands.high[0]}–{limits.estimateBands.high[1]} min) — wilder
                estimates simply don&apos;t add more.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </main>
  )
}
