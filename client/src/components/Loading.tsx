import { useEffect, useState } from 'react'

/**
 * Shared centered loading state (#398) — replaces the ad-hoc bare "Loading…"
 * text nodes. Three staggered pulse dots in the brand hue (the timer chip's
 * `animate-pulse-dot` vocabulary; index.css already stills it under
 * prefers-reduced-motion, so the dots simply show statically there) + an
 * sr-only "Loading…" for the `role="status"` announcement (#126).
 *
 * Appears after a ~180ms delay so fast transitions never flash a loader; the
 * container renders immediately, keeping the layout stable.
 *
 * Two flavours:
 *  - `page`  — a full-surface `<main>`, vertically + horizontally centered
 *              (route-level gates: ProtectedRoute, TaskView, InProgress, Stats)
 *  - default — centered in the list/content area it replaces
 *              (Dashboard, Notifications, CategoriesView, ProjectsView, …)
 */
const DOT_DELAYS = ['0ms', '160ms', '320ms']

function Indicator({ shown }: { shown: boolean }) {
  if (!shown) return null
  return (
    <span role="status" className="flex flex-col items-center gap-2.5">
      <span className="flex items-center gap-1.5" aria-hidden>
        {DOT_DELAYS.map((delay) => (
          <span
            key={delay}
            className="animate-pulse-dot h-2 w-2 rounded-full bg-primary"
            style={{ animationDelay: delay }}
          />
        ))}
      </span>
      <span className="sr-only">Loading…</span>
    </span>
  )
}

export function Loading({ page = false }: { page?: boolean }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 180)
    return () => clearTimeout(t)
  }, [])

  if (page) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Indicator shown={shown} />
      </main>
    )
  }
  return (
    <div className="flex justify-center p-8">
      <Indicator shown={shown} />
    </div>
  )
}
