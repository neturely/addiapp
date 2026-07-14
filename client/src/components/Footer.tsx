import { useAuth } from '@/auth/useAuth'

/**
 * Persistent app footer (visual refresh v2, #92). Minimal, centered, flat white.
 * This is the ONE home for logout across every authed screen (it moved here from
 * Home so it's consistent everywhere).
 */
export function Footer() {
  const { logout } = useAuth()

  return (
    <footer className="flex items-center justify-center gap-3 bg-surface px-4 py-4 text-xs text-muted">
      <span>© AddiApp</span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={() => void logout()} className="font-medium hover:text-primary">
        Log out
      </button>
    </footer>
  )
}
