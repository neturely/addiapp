export type Expression = 'neutral' | 'celebrating' | 'idle'

/**
 * AddiApp mascot — icon-style, expression-driven (#96, visual refresh v2 #91).
 *
 * One penguin-ish icon: green circle head + darker green crest/tuft, two pale
 * cream eye patches, an orange beak, and a face that changes per `expression`.
 * The body colour is CONSTANT across states — the FACE (eyes + beak) carries the
 * emotion, so the mascot keeps its silhouette against any state-coloured surface
 * under the flat "no border/shadow" rule. All colours are `--color-mascot-*`
 * tokens (see index.css); nothing is hardcoded. Not final illustrated art — this
 * is the SVG icon-system pass.
 */
export function Mascot({
  expression = 'neutral',
  className = '',
}: {
  expression?: Expression
  className?: string
}) {
  const label =
    expression === 'celebrating' ? 'AddiApp mascot, celebrating' : 'AddiApp mascot'

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label={label}
      width="120"
      height="120"
    >
      {/* head */}
      <circle cx="60" cy="66" r="40" fill="var(--color-mascot-body)" />

      {/* crown / tuft — penguin-hair silhouette, darker shade of the head */}
      <path
        d="M24 54 Q22 30 34 26 Q40 21 44 27 Q49 15 54 27 Q60 17 66 27 Q71 15 76 27 Q80 21 86 26 Q98 30 96 54 Q78 61 60 51 Q42 61 24 54 Z"
        fill="var(--color-mascot-crest)"
      />

      {/* eye patches (flat white on coral — no border needed) */}
      <circle cx="47" cy="62" r="12" fill="var(--color-mascot-patch)" />
      <circle cx="73" cy="62" r="12" fill="var(--color-mascot-patch)" />

      {/* eyes — the primary expression mechanism */}
      {expression === 'celebrating' ? (
        <>
          {/* happy "^^" closed eyes */}
          <path
            d="M40 65 Q47 56 54 65"
            stroke="var(--color-mascot-pupil)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M66 65 Q73 56 80 65"
            stroke="var(--color-mascot-pupil)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : expression === 'idle' ? (
        <>
          {/* small, low, calm pupils */}
          <circle cx="47" cy="66" r="4" fill="var(--color-mascot-pupil)" />
          <circle cx="73" cy="66" r="4" fill="var(--color-mascot-pupil)" />
        </>
      ) : (
        <>
          {/* neutral — round pupils with a catchlight */}
          <circle cx="47" cy="64" r="5.5" fill="var(--color-mascot-pupil)" />
          <circle cx="73" cy="64" r="5.5" fill="var(--color-mascot-pupil)" />
          <circle cx="49" cy="62" r="1.8" fill="var(--color-mascot-patch)" />
          <circle cx="75" cy="62" r="1.8" fill="var(--color-mascot-patch)" />
        </>
      )}

      {/* beak / mouth — amber, expression-reactive */}
      {expression === 'celebrating' ? (
        // open, wide beak — the payoff moment
        <path
          d="M50 78 Q60 74 70 78 Q60 92 50 78 Z"
          fill="var(--color-mascot-beak)"
        />
      ) : expression === 'idle' ? (
        // flatter, smaller closed beak
        <path d="M54 78 L66 78 L60 84 Z" fill="var(--color-mascot-beak)" />
      ) : (
        // neutral — small tidy beak
        <path d="M53 77 L67 77 L60 86 Z" fill="var(--color-mascot-beak)" />
      )}
    </svg>
  )
}
