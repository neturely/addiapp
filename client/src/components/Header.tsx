import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutGrid, Play, Plus, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useInProgress } from '@/inprogress/useInProgress'
import { TimerChip } from './TimerChip'
import type { AuthUser } from '@/auth/authContext'

/** 1–2 uppercase initials from the display name, falling back to the email. */
function initialsFor(user: AuthUser): string {
  const name = user.displayName?.trim()
  if (name) {
    const [first, second] = name.split(/\s+/)
    return (first[0] + (second?.[0] ?? '')).toUpperCase()
  }
  return user.email[0]!.toUpperCase()
}

/** Icon-only nav; a section stays active across its sub-routes. */
const NAV: { to: string; label: string; Icon: LucideIcon; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Play', Icon: Play, match: (p) => p === '/' || p.startsWith('/play') },
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutGrid, match: (p) => p.startsWith('/dashboard') },
]

/**
 * Persistent app header (visual refresh v2, #92). Flat white bar — separated
 * from the cream page by colour alone (no shadow, no border). Wordmark far left;
 * on the right, one grouped cluster: icon-only nav (colour = state, no label/bg),
 * a filled "Add task" CTA, and the initials avatar (which links to the user's
 * stats page — there is no separate "Stats" nav item).
 */
export function Header() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { activeTask } = useInProgress()
  // Gravatar loads over the initials fallback; d=404 makes Gravatar 404 when the
  // email has no avatar, so onError cleanly reveals the initials underneath (#174).
  const [avatarFailed, setAvatarFailed] = useState(false)
  const showGravatar = !!user?.gravatarHash && !avatarFailed

  return (
    <header className="flex items-center justify-between gap-4 bg-surface px-4 py-3 sm:px-6">
      <Link to="/" className="text-xl font-bold tracking-tight text-gray-900">
        Addi<span className="text-primary-ink">App</span>
      </Link>

      <div className="flex items-center gap-4 sm:gap-5">
        {activeTask && <TimerChip task={activeTask} />}
        <nav className="flex items-center gap-4">
          {NAV.map(({ to, label, Icon, match }) => {
            const active = match(pathname)
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={active ? 'text-primary-ink' : 'text-muted hover:text-gray-900'}
              >
                <Icon className="h-6 w-6" strokeWidth={2} />
              </Link>
            )
          })}
        </nav>

        <Link
          to="/tasks/new"
          state={{ from: pathname }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xl font-bold text-white transition hover:opacity-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          <span className="hidden sm:inline">Add task</span>
        </Link>

        {user && (
          <Link
            to="/stats"
            aria-label="Your stats"
            aria-current={pathname.startsWith('/stats') ? 'page' : undefined}
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold text-on-primary transition hover:opacity-90"
          >
            {showGravatar ? (
              <img
                src={`https://www.gravatar.com/avatar/${user.gravatarHash}?s=72&d=404`}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              initialsFor(user)
            )}
          </Link>
        )}
      </div>
    </header>
  )
}
