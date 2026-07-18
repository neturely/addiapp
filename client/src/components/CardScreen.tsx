import type { ReactNode } from 'react'

/**
 * Shared centered white-card screen (#183). Extracted from the Completion
 * redesign (#181) once the Play-mode empty state became the second adopter — a
 * flat white rounded card centered on the cream page (no shadow/border, #91).
 * `decoration` renders inside the positioning wrapper but outside the card, for
 * accents that spill past the card edge (e.g. Completion's corner confetti).
 */
export function CardScreen({
  children,
  decoration,
}: {
  children: ReactNode
  decoration?: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {decoration}
        <div className="flex flex-col items-center gap-5 rounded-2xl bg-surface p-8 text-center">
          {children}
        </div>
      </div>
    </main>
  )
}
