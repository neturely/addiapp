import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query (#260 shell; the hook #98 designed). Initialized
 * synchronously from `matchMedia` — CSR-only Vite SPA, so no hydration flash.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
