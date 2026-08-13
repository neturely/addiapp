/**
 * True for failures whose message the user can't act on: a 5xx (the API's
 * unhandled-exception handler answers a deliberately generic body), a network
 * failure, or a non-Error throw. Deliberate 4xx validation copy — and the
 * client-made 408 timeout message — are written for users and stay "expected".
 * (#415)
 */
export function isUnexpectedError(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status >= 500
}

/**
 * The user-facing message for an error: the server's own copy for expected
 * (4xx) failures, shared friendly copy naming the consequence for unexpected
 * ones — "Internal server error" is developer vocabulary and never renders
 * (#415). `consequence` is a short clause like "your changes weren't saved".
 */
export function friendlyMessage(err: unknown, consequence: string): string {
  if (!isUnexpectedError(err)) return (err as ApiError).message
  return `Something went wrong on our side — ${consequence}. Please try again.`
}

export class ApiError extends Error {
  status: number
  code?: string
  /** Extra fields the server sent beside error/message (e.g. the #319 TOTP
   *  login challenge). Untyped — narrow at the call site. */
  details?: Record<string, unknown>

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
