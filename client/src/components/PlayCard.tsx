import type { ReactNode } from 'react'

/**
 * Canonical Play-moment card (#204 epic / #208 Phase 1; TaskPresented + InProgress
 * added in Phase 2 / #211) — the shared skeleton for the single-message Play
 * screens. Renders a fixed slot order inside the flat white card (evolved from
 * `CardScreen`, #183; no shadow/border, centred on the cream page):
 *
 *   eyebrow? → title/body? → hero? → context? → primary → secondary? → footer?
 *
 * The `mascot` sits HALF-OUT (#211): absolutely positioned straddling the card's
 * top edge — half on the cream page, half over the card — rather than as an
 * in-flow first child. Pass it with `halo` + a sizing class (e.g.
 * `<Mascot halo className="h-24 w-24" />`) so its thin surface-coloured sticker
 * outline separates it from the page; the card itself stays flat (card shadows
 * are out of scope — see the spit & polish issue #213). The card's top padding
 * clears the mascot's lower half.
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
        {/* Half-out mascot: its vertical centre sits on the card's top edge, so
            it reads half on the page / half over the card. pointer-events-none —
            it's decorative and must never intercept taps on content below. */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-1/2 justify-center">
          {mascot}
        </div>
        <div className="flex flex-col items-center gap-5 rounded-2xl bg-surface px-8 pb-8 pt-16 text-center">
          {eyebrow && (
            <div className="text-sm font-semibold uppercase tracking-wide text-muted">{eyebrow}</div>
          )}
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
