import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'

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
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <Header />
      <div className="app-shell-content flex flex-1 flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
