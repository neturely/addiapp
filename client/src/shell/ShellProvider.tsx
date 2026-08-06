import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ShellContext } from './shellContext'

/**
 * Owns the app-shell state (#260). Play routes are "solo mode" — the focus
 * surface, no rail/column/search. The right column needs a wide viewport (the
 * prototype's 1240px); whenever it isn't rendered, the Header shows the Stats
 * icon instead so points are never invisible (epic #256 acceptance).
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const { pathname, key: locationKey } = useLocation()
  // Solo = focus surfaces with no rail/column/search: Play, and (#256 review)
  // Stats — a centred read-only page like Play, not an admin view.
  const solo = pathname === '/' || pathname.startsWith('/play') || pathname.startsWith('/stats')
  const wide = useMediaQuery('(min-width: 1240px)')
  // Below Tailwind's `sm` the rail becomes an overlay drawer (#270).
  const narrow = !useMediaQuery('(min-width: 640px)')

  const [search, setSearch] = useState('')
  const [railOpen, setRailOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [columnOpen, setColumnOpen] = useState(true)

  // A search is a view-local filter — leaving the view discards it.
  useEffect(() => setSearch(''), [pathname])
  // The drawer closes on ANY navigation (it overlays what you just navigated
  // to) — keyed on location.key since rail links often change only the query.
  useEffect(() => setDrawerOpen(false), [locationKey])

  const value = useMemo(
    () => ({
      search,
      setSearch,
      railOpen,
      toggleRail: () => setRailOpen((v) => !v),
      narrow,
      drawerOpen,
      toggleDrawer: () => setDrawerOpen((v) => !v),
      closeDrawer: () => setDrawerOpen(false),
      columnOpen,
      toggleColumn: () => setColumnOpen((v) => !v),
      solo,
      wide,
      columnVisible: columnOpen && wide && !solo,
    }),
    [search, railOpen, narrow, drawerOpen, columnOpen, solo, wide],
  )

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}
