/**
 * The fixed project-colour palette (#268). `projects.color` stores an INDEX into
 * this array — re-tuning a colour is a client-only change; adding a slot means
 * bumping the server bound too (`ProjectsController::PALETTE_SIZE`).
 *
 * Each slot: a human name (swatch aria-labels) + the pole classes; `darkCheck`
 * flags slots too light for the picker's white check mark. Slot 0 is the default.
 */
export type ProjectColor = { name: string; pole: string; darkCheck?: boolean }

export const PROJECT_COLORS: ProjectColor[] = [
  // A sliding scale through the spectrum (#256 review): 16 hues in even 18°
  // steps (HSL, lightness tuned per band so yellows/greens hold up as poles) —
  // the near-duplicate Jade/Blue/Magenta steps were dropped to make room for
  // the three neutrals at the end. Projects store INDICES — never reshuffle
  // without migrating the data: #308 removed the near-duplicate Green (old
  // slot 6) WITH migration 016 shifting stored indices ≥7 down one (20 → 19
  // slots; PALETTE_SIZE bumped alongside). Any future change must append,
  // swap in place, or bring its own index migration like that one.
  { name: 'Red', pole: 'bg-[#d11a1a]' },
  { name: 'Vermilion', pole: 'bg-[#d1511a]' },
  { name: 'Orange', pole: 'bg-[#d1881a]' },
  { name: 'Amber', pole: 'bg-[#bfae18]' },
  { name: 'Chartreuse', pole: 'bg-[#9dbf18]' },
  { name: 'Lime', pole: 'bg-[#66b616]' },
  { name: 'Emerald', pole: 'bg-[#16b656]' },
  { name: 'Mint', pole: 'bg-[#18bf8d]' },
  { name: 'Cyan', pole: 'bg-[#18bfbf]' },
  { name: 'Azure', pole: 'bg-[#188dbf]' },
  { name: 'Sky', pole: 'bg-[#1a63d1]' },
  { name: 'Indigo', pole: 'bg-[#3e1ad1]' },
  { name: 'Violet', pole: 'bg-[#751ad1]' },
  { name: 'Purple', pole: 'bg-[#ac1ad1]' },
  { name: 'Pink', pole: 'bg-[#d11a88]' },
  { name: 'Rose', pole: 'bg-[#d11a51]' },
  // Neutrals (#256 review). White carries an inset ring so the pole/swatch
  // stays visible on the white surface and cream page.
  { name: 'Black', pole: 'bg-[#23201c]' },
  { name: 'Grey', pole: 'bg-[#8a8f98]' },
  { name: 'White', pole: 'bg-white ring-1 ring-inset ring-gray-300', darkCheck: true },
]

/** Pole class for a palette index, tolerant of out-of-range values. */
export function projectPole(color: number | undefined): string {
  return (PROJECT_COLORS[color ?? 0] ?? PROJECT_COLORS[0]).pole
}

/**
 * Soft tint for a palette index (#336 — the row category chip): the hue mixed
 * lightly into white, so a dark neutral text stays AA on every slot. The White
 * slot (no embedded hex) falls back to the neutral field tone so the chip
 * stays visible on the white row surface.
 */
export function projectTint(color: number | undefined): string {
  const slot = PROJECT_COLORS[color ?? 0] ?? PROJECT_COLORS[0]
  const hex = /#[0-9a-f]{6}/i.exec(slot.pole)?.[0]
  if (!hex) return 'var(--color-field)'
  return `color-mix(in srgb, ${hex} 18%, white)`
}

/** The leading spectrum hues (slots 0–15); Black/Grey/White sit after them. */
export const SPECTRUM_SLOTS = 16

/** Roll a concrete palette index for the picker's "Random" cell (#308) — from
 *  the spectrum hues only, so the neutrals stay deliberate choices. */
export function randomSpectrumColor(): number {
  return Math.floor(Math.random() * SPECTRUM_SLOTS)
}
