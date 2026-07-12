type Mood = 'happy' | 'thinking' | 'sleepy'

/**
 * Placeholder mascot — a simple flat blob character, kept deliberately minimal.
 * Real mascot art + expression variations are a later design pass (see CLAUDE.md);
 * this just holds the spot consistently across the Play-mode screens. `mood`
 * nudges the face so Home / Choice / empty state don't all look identical.
 */
export function Mascot({ mood = 'happy', className = '' }: { mood?: Mood; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="AddiApp mascot"
      width="120"
      height="120"
    >
      {/* body */}
      <ellipse cx="60" cy="66" rx="42" ry="40" fill="#D85A30" />
      <ellipse cx="60" cy="72" rx="30" ry="26" fill="#F3B598" />
      {/* eyes */}
      {mood === 'sleepy' ? (
        <>
          <path d="M40 56 q8 6 16 0" stroke="#3A2016" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M64 56 q8 6 16 0" stroke="#3A2016" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="48" cy="56" r="6" fill="#3A2016" />
          <circle cx="72" cy="56" r="6" fill="#3A2016" />
          <circle cx="50" cy="54" r="2" fill="#fff" />
          <circle cx="74" cy="54" r="2" fill="#fff" />
        </>
      )}
      {/* mouth */}
      {mood === 'thinking' ? (
        <circle cx="60" cy="76" r="4" fill="#3A2016" />
      ) : (
        <path
          d="M48 74 q12 12 24 0"
          stroke="#3A2016"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {/* little antenna */}
      <line x1="60" y1="26" x2="60" y2="14" stroke="#D85A30" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="11" r="5" fill="#F5A623" />
    </svg>
  )
}
