/**
 * The fixed project-colour palette (#268). `projects.color` stores an INDEX into
 * this array — re-tuning a colour is a client-only change; adding a slot means
 * bumping the server bound too (`ProjectsController::PALETTE_SIZE`).
 *
 * Each slot: a human name (swatch aria-labels) + the pole classes. Slots reuse
 * the token hues where one exists; the rest are fixed hexes chosen to read as a
 * 9px pole on both cream and white. Slot 0 is the default.
 */
export type ProjectColor = { name: string; pole: string }

export const PROJECT_COLORS: ProjectColor[] = [
  { name: 'Sky', pole: 'bg-accent' },
  { name: 'Green', pole: 'bg-success' },
  { name: 'Amber', pole: 'bg-warning' },
  { name: 'Coral', pole: 'bg-primary' },
  { name: 'Violet', pole: 'bg-[#8b5cf6]' },
  { name: 'Pink', pole: 'bg-[#ec4899]' },
  { name: 'Teal', pole: 'bg-[#14b8a6]' },
  { name: 'Slate', pole: 'bg-[#64748b]' },
]

/** Pole class for a palette index, tolerant of out-of-range values. */
export function projectPole(color: number | undefined): string {
  return (PROJECT_COLORS[color ?? 0] ?? PROJECT_COLORS[0]).pole
}
