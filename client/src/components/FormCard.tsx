import type { ReactNode } from 'react'

/**
 * Shared "Form" template (#206) — the utility/admin counterpart to the Play-moment
 * `PlayCard` (#204). Same surface/spacing/corner-radius system as the Play cards
 * (flat white `rounded-2xl bg-surface p-6`), but deliberately NO mascot and no
 * celebratory framing — forms aren't part of the game loop.
 *
 * A titled surface box: AddTask / EditTask each wrap one (centered `h1`), Settings
 * stacks three (left-aligned `h2` sections). The page-level layout (centering vs.
 * the settings column, the outer `<main>`) stays with each screen; FormCard only
 * unifies the repeated card + heading.
 */
export function FormCard({
  title,
  children,
  headingLevel = 'h2',
  align = 'left',
  className = '',
}: {
  title: ReactNode
  children: ReactNode
  /** `h1` for a standalone form page (AddTask/EditTask); `h2` for a settings section. */
  headingLevel?: 'h1' | 'h2'
  align?: 'left' | 'center'
  /** Extra classes on the card (e.g. `w-full max-w-md`, or `mb-6` between sections). */
  className?: string
}) {
  const Heading = headingLevel
  const headingCls =
    headingLevel === 'h1'
      ? 'mb-5 text-2xl font-bold text-gray-800'
      : 'mb-4 text-lg font-bold text-gray-800'

  return (
    <section className={`rounded-2xl bg-surface p-6 ${className}`.trim()}>
      <Heading className={`${headingCls}${align === 'center' ? ' text-center' : ''}`}>
        {title}
      </Heading>
      {children}
    </section>
  )
}
