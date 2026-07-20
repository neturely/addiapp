import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Accessible modal dialog primitive (#218). Behaviour, not just a CSS overlay:
 * `role="dialog"` + `aria-modal` + `aria-labelledby`, a focus trap (Tab/Shift+Tab
 * cycle within the panel), Escape-to-close, backdrop-click-to-close, body-scroll
 * lock, and return-focus to whatever was focused when it opened (e.g. the row's
 * Edit button). Initial focus lands on the panel's first focusable element.
 *
 * Flat, per the no-shadow rule — the backdrop is a translucent scrim, the panel a
 * plain surface card. Currently the EditTask desktop modal's dialog shell; kept
 * generic so any future dialog reuses the a11y wiring rather than re-rolling it.
 */
export function Modal({
  titleId,
  onClose,
  children,
}: {
  /** id of the heading inside `children`, wired to `aria-labelledby`. */
  titleId: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Capture the opener so focus returns there on close; lock body scroll; move
  // focus into the panel. Restore both on unmount.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    focusable(panelRef.current)[0]?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCloseRef.current()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusable(panelRef.current)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const inside = panelRef.current?.contains(active as Node)
    if (e.shiftKey) {
      if (active === first || !inside) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last || !inside) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      // Backdrop click (only when the scrim itself is the target, not the panel).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6"
      >
        {children}
      </div>
    </div>
  )
}
