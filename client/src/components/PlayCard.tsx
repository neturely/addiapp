import type { ReactNode } from 'react'

/**
 * Canonical Play-moment card (#204 epic / #208 Phase 1) — the shared skeleton for
 * the single-message Play screens (Completion, EmptyState; TaskPresented +
 * InProgress in Phase 2). Renders a fixed slot order inside the flat white card
 * (evolved from `CardScreen`, #183; no shadow/border, centred on the cream page):
 *
 *   eyebrow? → mascot → title/body? → hero? → context? → primary → secondary? → footer?
 *
 * `decoration` renders inside the positioning wrapper but OUTSIDE the card, for
 * accents that spill past the edge (e.g. Completion's corner confetti). Only
 * `mascot`, `title`, and `primary` are required; the primary CTA is full-width.
 */
type PlayCardProps = {
  eyebrow?: ReactNode
  mascot: ReactNode
  title: ReactNode
  body?: ReactNode
  hero?: ReactNode
  context?: ReactNode
  primary: ReactNode
  secondary?: ReactNode
  footer?: ReactNode
  decoration?: ReactNode
}

export function PlayCard({
  eyebrow,
  mascot,
  title,
  body,
  hero,
  context,
  primary,
  secondary,
  footer,
  decoration,
}: PlayCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {decoration}
        <div className="flex flex-col items-center gap-5 rounded-2xl bg-surface p-8 text-center">
          {eyebrow && (
            <div className="text-sm font-semibold uppercase tracking-wide text-muted">{eyebrow}</div>
          )}
          {mascot}
          {(title || body) && (
            <div className="space-y-1">
              {title}
              {body}
            </div>
          )}
          {hero}
          {context && <div className="w-full">{context}</div>}
          <div className="w-full">{primary}</div>
          {secondary && <div className="w-full">{secondary}</div>}
          {footer && <p className="text-sm text-muted">{footer}</p>}
        </div>
      </div>
    </main>
  )
}
