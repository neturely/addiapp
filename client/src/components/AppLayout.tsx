import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { InProgressProvider } from '@/inprogress/InProgressProvider'

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
 * Persistent shell for every authed screen (visual refresh v2, #92): Header →
 * page → Footer on the cream page background. Inserted once at the ProtectedRoute
 * seam so all authed routes (incl. Play mode) gain it.
 *
 * The shell is a full-height flex column (header + flex-1 content + footer) and
 * OWNS page height: the `.app-shell-content` rule in index.css neutralizes any
 * page-level `min-h-screen` so the footer sits at the viewport bottom on short
 * content and is pushed down (never overlapped) on long content — independent of
 * each page's internals (the per-screen `min-h-screen` cleanup is retrofit #94).
 *
 * A11Y (#126): a skip link jumps keyboard users past the Header nav to the
 * content region (`#main-content`, a `tabIndex=-1` focus target that also backs
 * RouteFocus). Each page keeps its own `<main>` landmark inside it.
 */
export function AppLayout() {
  return (
    <InProgressProvider>
      <div className="flex min-h-screen flex-col bg-page">
        <RouteFocus />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-on-primary"
        >
          Skip to main content
        </a>
        <Header />
        <div
          id="main-content"
          tabIndex={-1}
          className="app-shell-content flex flex-1 flex-col focus:outline-none"
        >
          <Outlet />
        </div>
        <Footer />
      </div>
    </InProgressProvider>
  )
}
