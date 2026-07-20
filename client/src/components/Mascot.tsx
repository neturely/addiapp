import type { ReactNode } from 'react'

export type Expression = 'neutral' | 'celebrating' | 'idle'

/**
 * AddiApp mascot — the "star character" (#210, supersedes the #96 penguin).
 *
 * A round golden face with four chunky rounded star-point limbs (two arms, two
 * legs) that POSE per expression — the limbs are a second expression channel on
 * top of the eyes + mouth. Big cartoony eyes, soft blush cheeks, a low coral
 * smile, and a front cowlick on the crown.
 *
 * The body colour is CONSTANT across states — the FACE and the limb POSE carry
 * the emotion, so the mascot keeps its silhouette against any state-coloured
 * surface under the flat "no border/shadow" rule. All colours are
 * `--color-mascot-*` tokens (see index.css); nothing is hardcoded. Not final
 * illustrated art — this is the SVG icon-system pass.
 *
 * `halo` draws a thin, theme-aware sticker outline (surface-coloured, via a
 * stacked drop-shadow filter) plus a light lift shadow — used when the mascot
 * straddles a card edge (the Phase 2 half-out placement, #211). Default off, so
 * existing flat placements are unchanged.
 */

// ── Geometry (ported verbatim from the #210 preview; viewBox 0 0 120 120) ──────
const C: [number, number] = [60, 54]
const R = 38

const nrm = (v: [number, number]): [number, number] => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}

// chunky star-point limb; bulge < 0 => concave fillet neck (chosen: -0.22)
function limbPath(
  dir: [number, number],
  reach: number,
  inset: number,
  bw: number,
  bulge: number,
): string {
  const u = nrm(dir)
  const p: [number, number] = [-u[1], u[0]]
  const B: [number, number] = [C[0] + u[0] * (R - inset), C[1] + u[1] * (R - inset)]
  const T: [number, number] = [C[0] + u[0] * reach, C[1] + u[1] * reach]
  const B1: [number, number] = [B[0] + p[0] * bw, B[1] + p[1] * bw]
  const B2: [number, number] = [B[0] - p[0] * bw, B[1] - p[1] * bw]
  const len = Math.hypot(T[0] - B[0], T[1] - B[1])
  const c1: [number, number] = [
    B1[0] + u[0] * len * 0.58 + p[0] * bw * bulge,
    B1[1] + u[1] * len * 0.58 + p[1] * bw * bulge,
  ]
  const c2: [number, number] = [
    B2[0] + u[0] * len * 0.58 - p[0] * bw * bulge,
    B2[1] + u[1] * len * 0.58 - p[1] * bw * bulge,
  ]
  const f = (a: [number, number]) => a.map((n) => n.toFixed(1)).join(' ')
  return `M${f(B1)} Q${f(c1)} ${f(T)} Q${f(c2)} ${f(B2)} Z`
}

const DIRS: Record<Expression, [number, number]> = {
  neutral: [-0.9, -0.32],
  celebrating: [-0.6, -0.8],
  idle: [-0.72, 0.5],
}

function limbPaths(expr: Expression): string[] {
  const al = DIRS[expr]
  const ar: [number, number] = [-al[0], al[1]]
  const sp = expr === 'celebrating' ? 0.12 : 0
  const g = { aR: 50, lR: 51, inset: 10, aW: 12, lW: 11, bulge: -0.22 }
  return [
    limbPath(al, g.aR, g.inset, g.aW, g.bulge),
    limbPath(ar, g.aR, g.inset, g.aW, g.bulge),
    limbPath([-0.34 - sp, 0.94], g.lR, g.inset, g.lW, g.bulge),
    limbPath([0.34 + sp, 0.94], g.lR, g.inset, g.lW, g.bulge),
  ]
}

// eye geometry
const EX1 = 45
const EX2 = 75
const EY = 50
const EYE_R = 16
const PR = 9

// theme-aware sticker outline: 8-direction stacked drop-shadow in the surface
// colour, so the mascot separates from the page when it half-straddles a card.
const HALO_FILTER = [
  [1.5, 0],
  [-1.5, 0],
  [0, 1.5],
  [0, -1.5],
  [1.1, 1.1],
  [1.1, -1.1],
  [-1.1, 1.1],
  [-1.1, -1.1],
]
  .map(([x, y]) => `drop-shadow(${x}px ${y}px 0 var(--color-surface))`)
  .concat('drop-shadow(0 2px 3px rgba(0,0,0,0.18))')
  .join(' ')

export function Mascot({
  expression = 'neutral',
  className = '',
  halo = false,
}: {
  expression?: Expression
  className?: string
  /** Draw the theme-aware sticker outline + lift shadow (half-out placement). */
  halo?: boolean
}) {
  const label =
    expression === 'celebrating' ? 'AddiApp mascot, celebrating' : 'AddiApp mascot'

  const eyeWhite = (cx: number) => (
    <circle key={`w${cx}`} cx={cx} cy={EY} r={EYE_R} fill="var(--color-mascot-patch)" />
  )

  let eyes: ReactNode
  if (expression === 'idle') {
    // look-down (locked): pupils sit low — attentive, watching the task
    const py = EY + EYE_R * 0.42
    const pupil = (cx: number) => (
      <g key={`p${cx}`}>
        <circle cx={cx} cy={py} r={PR} fill="var(--color-mascot-pupil)" />
        <circle
          cx={cx + PR * 0.4}
          cy={py - PR * 0.4}
          r={PR * 0.32}
          fill="var(--color-mascot-patch)"
        />
      </g>
    )
    eyes = (
      <>
        {eyeWhite(EX1)}
        {eyeWhite(EX2)}
        {pupil(EX1)}
        {pupil(EX2)}
      </>
    )
  } else {
    const up = expression === 'celebrating' ? -EYE_R * 0.15 : 0
    const py = EY + EYE_R * 0.1 + up
    const pupil = (cx: number) => (
      <g key={`p${cx}`}>
        <circle cx={cx} cy={py} r={PR} fill="var(--color-mascot-pupil)" />
        <circle
          cx={cx + PR * 0.42}
          cy={EY - PR * 0.42 + up}
          r={PR * 0.34}
          fill="var(--color-mascot-patch)"
        />
        {expression === 'celebrating' && (
          <circle
            cx={cx - PR * 0.5}
            cy={EY + PR * 0.3 + up}
            r={PR * 0.17}
            fill="var(--color-mascot-patch)"
          />
        )}
      </g>
    )
    eyes = (
      <>
        {eyeWhite(EX1)}
        {eyeWhite(EX2)}
        {pupil(EX1)}
        {pupil(EX2)}
      </>
    )
  }

  let mouth: ReactNode
  if (expression === 'celebrating') {
    mouth = <path d="M52 73 Q60 71 68 73 Q60 87 52 73 Z" fill="var(--color-mascot-beak)" />
  } else if (expression === 'idle') {
    mouth = (
      <path
        d="M56 76 Q60 78.5 64 76"
        stroke="var(--color-mascot-beak)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    )
  } else {
    mouth = (
      <path
        d="M53 73 Q60 80 67 73"
        stroke="var(--color-mascot-beak)"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
    )
  }

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label={label}
      width="120"
      height="120"
      style={halo ? { filter: HALO_FILTER } : undefined}
    >
      {/* limbs (behind the body) — pose per expression */}
      {limbPaths(expression).map((d, i) => (
        <path key={i} d={d} fill="var(--color-mascot-body)" />
      ))}

      {/* round golden face */}
      <circle cx="60" cy="54" r="38" fill="var(--color-mascot-body)" />

      {/* blush cheeks */}
      <ellipse cx="33" cy="64" rx="7" ry="4.8" fill="var(--color-mascot-blush)" opacity="0.5" />
      <ellipse cx="87" cy="64" rx="7" ry="4.8" fill="var(--color-mascot-blush)" opacity="0.5" />

      {/* front cowlick on the crown */}
      <path
        d="M53 20 C49 6 65 2 69 12 C71 18 63 20 59 16 C61 10 55 11 56 21 Z"
        fill="var(--color-mascot-crest)"
      />

      {eyes}
      {mouth}
    </svg>
  )
}
