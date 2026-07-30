import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
/** Rapid-fire toasts STACK (#256 review) rather than overriding; oldest drops
 *  beyond this cap so the pile can't grow unbounded. */
const MAX_STACK = 5

type StackedToast = ToastOptions & { id: number }

/**
 * Renders a stack of dark toast pills (bottom-centre on phones, bottom-right on
 * desktop, #256 review) with a colored icon badge, message, optional inline
 * action, and a dismiss button (#176). role="status" + aria-live matches the
 * app's a11y conventions (#126); each toast's auto-dismiss pauses independently
 * on hover/focus so keyboard/SR users can reach its action before it vanishes.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<StackedToast[]>([])
  const nextId = useRef(0)

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((opts: ToastOptions) => {
    const id = nextId.current++
    setToasts((prev) => [...prev.slice(-(MAX_STACK - 1)), { ...opts, id }])
  }, [])

  const dismissToast = useCallback(() => setToasts([]), [])

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-8 sm:left-auto sm:right-8 sm:translate-x-0 sm:items-end">
          {toasts.map((t) => (
            <ToastPill key={t.id} toast={t} onDone={() => removeToast(t.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/** One pill with its own pause-on-hover/focus auto-dismiss timer. */
function ToastPill({ toast, onDone }: { toast: StackedToast; onDone: () => void }) {
  const timerRef = useRef<number | null>(null)
  // Ref-stable dismiss: `onDone` is a fresh closure on every provider render
  // (any stack change), and depending on it restarted EVERY pill's timer in
  // lockstep — they all expired together. The timer must run once from mount.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const duration = toast.duration ?? DEFAULT_DURATION

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])
  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = window.setTimeout(() => onDoneRef.current(), duration)
  }, [clearTimer, duration])

  useEffect(() => {
    startTimer()
    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Icon = toast.icon
  const tone = toast.tone ?? 'neutral'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      onFocus={clearTimer}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) startTimer()
      }}
      className="flex max-w-full items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white"
    >
      {Icon && (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}
        >
          {/* accent fill isn't tuned for white — use dark on-fill there (#195). */}
          <Icon
            className={`h-5 w-5 ${tone === 'accent' ? 'text-on-accent' : 'text-white'}`}
            strokeWidth={2.5}
          />
        </span>
      )}
      <span className="min-w-0 font-medium">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            const act = toast.action!
            onDone()
            act.onClick()
          }}
          className="ml-1 shrink-0 cursor-pointer font-bold text-white underline underline-offset-2 hover:opacity-80"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDone}
        aria-label="Dismiss"
        className="ml-1 shrink-0 cursor-pointer text-gray-400 transition hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
