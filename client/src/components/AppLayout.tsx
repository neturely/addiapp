import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Header } from './Header'
import { Footer } from './Footer'
import { Rail } from './Rail'
import { RightColumn } from './RightColumn'
import { InProgressProvider } from '@/inprogress/InProgressProvider'
import { OverrunWatcher } from '@/inprogress/OverrunWatcher'
import { NotificationsProvider } from '@/notifications/NotificationsProvider'
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
  const { solo, railOpen, columnVisible, narrow, drawerOpen, closeDrawer } = useShell()

  // Mobile rail drawer (#270): Escape closes + returns focus to the hamburger;
  // initial focus moves onto the first rail link so keyboard users land inside.
  const drawerRef = useRef<HTMLDivElement>(null)
  const showDrawer = !solo && narrow && drawerOpen
  useEffect(() => {
    if (!showDrawer) return
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer()
        document.querySelector<HTMLElement>('button[aria-label="Toggle sidebar"]')?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showDrawer, closeDrawer])

  return (
    <div className="flex h-screen flex-col bg-page">
      <RouteFocus />
      {/* #423: local boundary detection for the #403 overrun stages. */}
      <OverrunWatcher />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-on-primary"
      >
        Skip to main content
      </a>
      <Header />
      <div className="flex min-h-0 flex-1">
        {/* Static rail at sm+ only — below sm the drawer owns the markup (and
            the #app-rail id, so aria-controls never points at a duplicate). */}
        {!solo && railOpen && !narrow && <Rail />}
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

      {showDrawer && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            className="absolute inset-0 h-full w-full cursor-default bg-gray-900/45"
          />
          <div ref={drawerRef} className="absolute inset-y-0 left-0 w-64 bg-page shadow-none">
            <Rail drawer />
          </div>
        </div>
      )}
    </div>
  )
}

export function AppLayout() {
  return (
    <InProgressProvider>
      <NotificationsProvider>
        <ToastProvider>
          <ShellProvider>
            <ShellFrame />
          </ShellProvider>
        </ToastProvider>
      </NotificationsProvider>
    </InProgressProvider>
  )
}
