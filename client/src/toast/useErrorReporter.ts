import { useCallback } from 'react'
import { CircleAlert } from 'lucide-react'
import { friendlyMessage, isUnexpectedError } from '../lib/apiError'
import { useToast } from './useToast'

/**
 * The #415 action-error pattern in one line: unexpected failures (5xx/network)
 * surface as a danger toast with friendly copy — never the raw
 * "Internal server error" — while deliberate 4xx validation copy keeps
 * rendering inline near the control that caused it.
 *
 *   const reportError = useErrorReporter()
 *   … catch (err) { reportError(err, "your changes weren't saved", setError) }
 *
 * Omit `setInline` (or pass none) to toast every failure — for sites with no
 * inline alert of their own. Only usable under ToastProvider (inside
 * AppLayout); auth pages render `friendlyMessage` inline instead.
 */
export function useErrorReporter() {
  const { showToast } = useToast()
  return useCallback(
    (err: unknown, consequence: string, setInline?: (message: string) => void) => {
      if (isUnexpectedError(err) || !setInline) {
        showToast({
          message: friendlyMessage(err, consequence),
          icon: CircleAlert,
          tone: 'danger',
          // errors linger a bit longer than the 5s celebratory default
          duration: 7000,
        })
      } else {
        setInline(friendlyMessage(err, consequence))
      }
    },
    [showToast],
  )
}
