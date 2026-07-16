/**
 * Tiny decoupling seam between the fetch layer and React routing (issue #101).
 *
 * `apiRequest` lives outside React and can't call `useNavigate`, so on a 401 it
 * calls `notifyUnauthorized()` here; `AuthProvider` registers the real handler
 * (clear the user + flag the expiry) via `setUnauthorizedHandler`. Keeping this
 * in `lib/` free of routing deps also makes the 401 path unit-testable.
 */
type UnauthorizedHandler = () => void

let handler: UnauthorizedHandler | null = null

/** Register the app's 401 handler. Returns an unsubscribe for cleanup. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler): () => void {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

/** Invoked by the fetch layer when an authenticated request 401s. No-op if unset. */
export function notifyUnauthorized(): void {
  handler?.()
}
