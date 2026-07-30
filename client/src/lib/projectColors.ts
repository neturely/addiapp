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
  // A sliding scale through the spectrum (#256 review): 20 hues in even 18°
  // steps (HSL, lightness tuned per band so yellows/greens hold up as poles).
  // Projects store INDICES — reordering this list recolours existing projects,
  // so any future change must append or swap in place, never reshuffle.
  { name: 'Red', pole: 'bg-[#d11a1a]' },
  { name: 'Vermilion', pole: 'bg-[#d1511a]' },
  { name: 'Orange', pole: 'bg-[#d1881a]' },
  { name: 'Amber', pole: 'bg-[#bfae18]' },
  { name: 'Chartreuse', pole: 'bg-[#9dbf18]' },
  { name: 'Lime', pole: 'bg-[#66b616]' },
  { name: 'Green', pole: 'bg-[#36b616]' },
  { name: 'Jade', pole: 'bg-[#16b626]' },
  { name: 'Emerald', pole: 'bg-[#16b656]' },
  { name: 'Mint', pole: 'bg-[#18bf8d]' },
  { name: 'Cyan', pole: 'bg-[#18bfbf]' },
  { name: 'Azure', pole: 'bg-[#188dbf]' },
  { name: 'Sky', pole: 'bg-[#1a63d1]' },
  { name: 'Blue', pole: 'bg-[#1a2cd1]' },
  { name: 'Indigo', pole: 'bg-[#3e1ad1]' },
  { name: 'Violet', pole: 'bg-[#751ad1]' },
  { name: 'Purple', pole: 'bg-[#ac1ad1]' },
  { name: 'Magenta', pole: 'bg-[#d11abe]' },
  { name: 'Pink', pole: 'bg-[#d11a88]' },
  { name: 'Rose', pole: 'bg-[#d11a51]' },
]

/** Pole class for a palette index, tolerant of out-of-range values. */
export function projectPole(color: number | undefined): string {
  return (PROJECT_COLORS[color ?? 0] ?? PROJECT_COLORS[0]).pole
}
