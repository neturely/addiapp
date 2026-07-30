/**
 * Confetti-dot accents (#94 B1), positioned at a card's corners (#181) —
 * positions are relative to the card wrapper; negative offsets let a few peek
 * just outside the card edge. `animate-confetti` (pop/drift/fade) is disabled
 * under prefers-reduced-motion. Shared by the Play Completion screen and the
 * right column's celebration (#256 review).
 */
export const CONFETTI = [
  { color: 'var(--color-primary)', pos: '-top-2 left-6', delay: '0s' },
  { color: 'var(--color-success)', pos: '-top-3 right-10', delay: '0.5s' },
  { color: 'var(--color-accent)', pos: 'top-8 -left-2', delay: '0.2s' },
  { color: 'var(--color-warning)', pos: 'top-12 -right-2', delay: '0.9s' },
  { color: 'var(--color-accent)', pos: '-bottom-2 left-10', delay: '0.35s' },
  { color: 'var(--color-primary)', pos: '-bottom-3 right-8', delay: '1.2s' },
  { color: 'var(--color-success)', pos: 'bottom-10 -left-3', delay: '0.7s' },
  { color: 'var(--color-warning)', pos: 'bottom-14 -right-3', delay: '1.5s' },
]
