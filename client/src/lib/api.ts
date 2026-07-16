import { ApiError } from './apiError'
import { notifyUnauthorized } from './authSignal'

type ApiErrorBody = { error?: string; message?: string }

export type ApiRequestOptions = RequestInit & {
  /**
   * Skip the global 401 handler for this call (issue #101). Set for `/auth/*`
   * requests, where a 401 is a legitimate local outcome (bad login, bootstrap
   * `/auth/me`, invalid verify/reset token) and must stay a form error rather
   * than trigger the session-expired redirect.
   */
  skipUnauthorizedHandler?: boolean
}

/**
 * fetch wrapper for the JSON API. Sends cookies, sets JSON headers, and throws
 * ApiError on non-2xx. A machine-readable `code` is exposed only when the server
 * sent both `error` (code) and `message` (human text) — e.g. `email_not_verified`.
 *
 * On a 401 for a non-`/auth/*` path (session expired mid-use) it notifies the
 * registered handler before throwing, so the app can redirect to /login (#101).
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { skipUnauthorizedHandler, ...init } = options
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })

  const isJson = res.headers.get('content-type')?.includes('application/json') ?? false
  const data = (isJson ? await res.json() : null) as (ApiErrorBody & T) | null

  if (!res.ok) {
    if (res.status === 401 && !skipUnauthorizedHandler && !path.startsWith('/auth/')) {
      notifyUnauthorized()
    }
    const body = (data ?? {}) as ApiErrorBody
    const code = body.message ? body.error : undefined
    throw new ApiError(body.message ?? body.error ?? 'Something went wrong', res.status, code)
  }
  return data as T
}
