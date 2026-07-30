import { createContext } from 'react'

/**
 * App-shell state (#260): the header search text plus the rail / right-column
 * open toggles, shared between the Header (controls), the shell chrome, and the
 * views that consume search. Session-scoped — deliberately not persisted.
 */
export type ShellState = {
  /** Header search text; views filter their loaded content by it. */
  search: string
  setSearch: (q: string) => void
  railOpen: boolean
  toggleRail: () => void
  columnOpen: boolean
  toggleColumn: () => void
  /** True on the Play routes — the focus surface, where the shell chrome
   * (rail, right column, search) is hidden. */
  solo: boolean
  /** Viewport wide enough for the right column (the prototype's 1240px). */
  wide: boolean
  /** The right column is actually rendered (open + wide + not solo) — when
   * false, the header shows the Stats icon so points stay reachable. */
  columnVisible: boolean
}

export const ShellContext = createContext<ShellState | null>(null)
