import { createContext } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * App-wide toast system (#176). A single provider (mounted in AppLayout) renders
 * one transient toast at a time, so a toast survives the route change that raised
 * it (e.g. AddTask fires one, then navigates back to the dashboard where it shows).
 * Generalized from the dashboard's bespoke undo-delete toast — same pause-on-hover
 * dismissal, but reusable from any screen via useToast().
 */
export type ToastTone = 'success' | 'primary' | 'accent' | 'warning' | 'neutral'

/** Optional inline action (e.g. "Play"); clicking it dismisses the toast first. */
export type ToastAction = { label: string; onClick: () => void }

export type ToastOptions = {
  message: string
  /** Lucide icon shown in the colored badge; the badge color follows `tone`. */
  icon?: LucideIcon
  tone?: ToastTone
  action?: ToastAction
  /** Auto-dismiss delay in ms (default 5000). */
  duration?: number
}

export type ToastContextValue = {
  showToast: (opts: ToastOptions) => void
  dismissToast: () => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
