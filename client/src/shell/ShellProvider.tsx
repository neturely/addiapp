import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ShellContext } from './shellContext'

/**
 * Owns the app-shell state (#260). Play routes are "solo mode" — the focus
 * surface, no rail/column/search. The right column needs a wide viewport (the
 * prototype's 1240px); whenever it isn't rendered, the Header shows the Stats
 * icon instead so points are never invisible (epic #256 acceptance).
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const solo = pathname === '/' || pathname.startsWith('/play')
  const wide = useMediaQuery('(min-width: 1240px)')

  const [search, setSearch] = useState('')
  const [railOpen, setRailOpen] = useState(true)
  const [columnOpen, setColumnOpen] = useState(true)

  // A search is a view-local filter — leaving the view discards it.
  useEffect(() => setSearch(''), [pathname])

  const value = useMemo(
    () => ({
      search,
      setSearch,
      railOpen,
      toggleRail: () => setRailOpen((v) => !v),
      columnOpen,
      toggleColumn: () => setColumnOpen((v) => !v),
      solo,
      wide,
      columnVisible: columnOpen && wide && !solo,
    }),
    [search, railOpen, columnOpen, solo, wide],
  )

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}
