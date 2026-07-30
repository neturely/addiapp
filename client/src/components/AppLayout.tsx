import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { Rail } from './Rail'
import { RightColumn } from './RightColumn'
import { InProgressProvider } from '@/inprogress/InProgressProvider'
import { ShellProvider } from '@/shell/ShellProvider'
import { useShell } from '@/shell/useShell'
import { ToastProvider } from '@/toast/ToastProvider'

/**
 * Moves keyboard/screen-reader focus to the content region on route change so a
 * navigation isn't silent and doesn't strand focus on the previous page (A11Y-2,
 * #126). Skips the initial mount (nothing to announce yet). Renders nothing.
 */
function RouteFocus() {
  const { pathname } = useLocation()
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    document.getElementById('main-content')?.focus()
  }, [pathname])
  return null
}

/**
 * Persistent shell for every authed screen (#260, superseding the #92 column):
 * Header on top, then rail | content | right column, then a thin footer — a
 * fixed-viewport (h-screen) frame where the three middle panes scroll
 * internally. Play routes are solo mode (rail/column/search hidden — focus
 * surface); the Header shows a Stats icon whenever the column isn't rendered so
 * points stay reachable at every width.
 *
 * A11Y (#126): the skip link jumps past the chrome to `#main-content` (the
 * scrolling content pane, also RouteFocus's target). Pages keep their own
 * `<main>` landmark; `.app-shell-content` still neutralizes page-level
 * `min-h-screen`.
 */
function ShellFrame() {
  const { solo, railOpen, columnVisible } = useShell()
  return (
    <div className="flex h-screen flex-col bg-page">
      <RouteFocus />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-on-primary"
      >
        Skip to main content
      </a>
      <Header />
      <div className="flex min-h-0 flex-1">
        {!solo && railOpen && <Rail />}
        <div
          id="main-content"
          tabIndex={-1}
          className="app-shell-content flex min-w-0 flex-1 flex-col overflow-y-auto focus:outline-none"
        >
          <Outlet />
        </div>
        {columnVisible && <RightColumn />}
      </div>
      <Footer />
    </div>
  )
}

export function AppLayout() {
  return (
    <InProgressProvider>
      <ToastProvider>
        <ShellProvider>
          <ShellFrame />
        </ShellProvider>
      </ToastProvider>
    </InProgressProvider>
  )
}
