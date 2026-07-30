import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CircleCheck,
  LayoutGrid,
  Menu,
  PanelRight,
  Play,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useInProgress } from '@/inprogress/useInProgress'
import { logoutOtherDevices } from '@/lib/account'
import { useShell } from '@/shell/useShell'
import { useToast } from '@/toast/useToast'
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
  { to: '/play', label: 'Play', Icon: Play, match: (p) => p === '/' || p.startsWith('/play') },
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutGrid, match: (p) => p.startsWith('/dashboard') },
  { to: '/settings', label: 'Settings', Icon: Settings, match: (p) => p.startsWith('/settings') },
]

/**
 * The shell header (#260, replacing the #92 bar): hamburger (rail toggle) +
 * wordmark + search + icon nav + right-column toggle + avatar menu. Search and
 * the two panel toggles hide in solo mode (Play is the focus surface). The
 * Stats icon appears ONLY when the right column isn't rendered — the epic
 * acceptance that points are never invisible at any width. The old "Add task"
 * CTA moved to the rail's Tasks plus (prototype layout).
 *
 * The avatar opens a plain disclosure (repo a11y rule — not a role=menu
 * widget): aria-expanded, Escape + outside click close, focus returns to the
 * trigger on Escape. Logout lives here now (moved from the Footer).
 */
export function Header() {
  const { user, logout } = useAuth()
  const { showToast } = useToast()
  const { pathname } = useLocation()
  const { activeTask, activeTasks } = useInProgress()
  const {
    search,
    setSearch,
    railOpen,
    toggleRail,
    narrow,
    drawerOpen,
    toggleDrawer,
    columnOpen,
    toggleColumn,
    solo,
    columnVisible,
  } = useShell()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)

  // Gravatar loads over the initials fallback; d=404 makes Gravatar 404 when the
  // email has no avatar, so onError cleanly reveals the initials underneath (#174).
  const [avatarFailed, setAvatarFailed] = useState(false)
  useEffect(() => setAvatarFailed(false), [user?.gravatarHash])
  const showGravatar = !!user?.gravatarHash && !avatarFailed

  // Disclosure close: outside click, Escape (focus back to the trigger), route change.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !avatarRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        avatarRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <header className="relative z-10 flex flex-none items-center gap-3 bg-surface px-3 py-2.5 sm:px-4">
      {!solo && (
        <button
          type="button"
          // At sm+ this collapses the static rail; below sm it opens the
          // overlay drawer (#270) — same control, per-breakpoint target.
          onClick={narrow ? toggleDrawer : toggleRail}
          aria-label="Toggle sidebar"
          aria-expanded={narrow ? drawerOpen : railOpen}
          aria-controls="app-rail"
          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-control text-gray-700 transition hover:bg-page"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      )}

      <Link to="/" className="text-xl font-bold tracking-tight text-gray-900">
        Addi<span className="text-primary-ink">App</span>
      </Link>

      {!solo && (
        <div className="mx-2 hidden h-10 max-w-xl flex-1 items-center gap-2.5 rounded-control bg-field px-3.5 sm:flex">
          <Search className="h-4 w-4 flex-none text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks and projects"
            aria-label="Search tasks and projects"
            className="w-full bg-transparent text-sm text-gray-800 placeholder:text-muted focus:outline-none"
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {activeTask && <TimerChip task={activeTask} others={activeTasks.length - 1} />}
        <nav className="flex items-center gap-1" aria-label="Primary">
          {NAV.map(({ to, label, Icon, match }) => {
            const active = match(pathname)
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-control transition ${
                  active ? 'bg-primary-tint text-primary-ink' : 'text-gray-700 hover:bg-page'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </Link>
            )
          })}
          {!columnVisible && (
            <Link
              to="/stats"
              aria-label="Your stats"
              aria-current={pathname.startsWith('/stats') ? 'page' : undefined}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-control transition ${
                pathname.startsWith('/stats')
                  ? 'bg-primary-tint text-primary-ink'
                  : 'text-gray-700 hover:bg-page'
              }`}
            >
              <BarChart3 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </Link>
          )}
        </nav>

        {!solo && (
          <>
            <span className="mx-1 hidden h-5 w-px bg-field-hover sm:block" aria-hidden />
            <button
              type="button"
              onClick={toggleColumn}
              aria-label="Toggle side column"
              aria-pressed={columnOpen}
              className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-control text-gray-700 transition hover:bg-page min-[1240px]:inline-flex"
            >
              <PanelRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </button>
          </>
        )}

        {user && (
          <div className="relative ml-1.5">
            <button
              ref={avatarRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-accent-tint text-sm font-bold text-accent-ink transition hover:opacity-90"
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
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
                className="absolute right-0 top-11 z-20 w-60 rounded-xl bg-surface p-2 ring-1 ring-field-hover"
              >
                <div className="px-3 pb-2.5 pt-2">
                  <p className="truncate text-sm font-semibold text-gray-800">
                    {user.displayName ?? user.email}
                  </p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
                <div className="mb-1 h-px bg-field" aria-hidden />
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-9 w-full items-center rounded-lg px-3 text-sm text-gray-700 hover:bg-page"
                >
                  Account settings
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex h-9 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm text-gray-700 hover:bg-page"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void logoutOtherDevices().then(() =>
                      showToast({
                        message: 'Signed out on your other devices',
                        icon: CircleCheck,
                        tone: 'success',
                      }),
                    )
                  }}
                  className="flex h-9 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm text-gray-700 hover:bg-page"
                >
                  Sign out other devices
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
