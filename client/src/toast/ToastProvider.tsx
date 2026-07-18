import { useCallback, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { ToastContext, type ToastOptions, type ToastTone } from './toastContext'

/** Icon-badge fill per tone (the colored circle carries the gamified accent). */
const TONE_BADGE: Record<ToastTone, string> = {
  success: 'bg-success',
  primary: 'bg-primary',
  accent: 'bg-accent',
  warning: 'bg-warning',
  neutral: 'bg-gray-600',
}

const DEFAULT_DURATION = 5000

/**
 * Renders a single dark toast pill (bottom-center) with a colored icon badge,
 * message, optional inline action, and a dismiss button (#176). role="status" +
 * aria-live matches the app's a11y conventions (#126); auto-dismiss pauses on
 * hover/focus so keyboard/SR users can reach the action before it vanishes.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(
    (duration: number) => {
      clearTimer()
      timerRef.current = window.setTimeout(() => setToast(null), duration)
    },
    [clearTimer],
  )

  const dismissToast = useCallback(() => {
    clearTimer()
    setToast(null)
  }, [clearTimer])

  const showToast = useCallback(
    (opts: ToastOptions) => {
      setToast(opts)
      startTimer(opts.duration ?? DEFAULT_DURATION)
    },
    [startTimer],
  )

  const resume = () => toast && startTimer(toast.duration ?? DEFAULT_DURATION)
  const Icon = toast?.icon
  const tone = toast?.tone ?? 'neutral'

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          onMouseEnter={clearTimer}
          onMouseLeave={resume}
          onFocus={clearTimer}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) resume()
          }}
          className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white"
        >
          {Icon && (
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}
            >
              <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
          )}
          <span className="min-w-0 font-medium">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                const act = toast.action!
                dismissToast()
                act.onClick()
              }}
              className="ml-1 shrink-0 cursor-pointer font-bold text-white underline underline-offset-2 hover:opacity-80"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={dismissToast}
            aria-label="Dismiss"
            className="ml-1 shrink-0 cursor-pointer text-gray-400 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}
