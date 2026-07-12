import { ApiError } from './apiError'

type ApiErrorBody = { error?: string; message?: string }

/**
 * fetch wrapper for the JSON API. Sends cookies, sets JSON headers, and throws
 * ApiError on non-2xx. A machine-readable `code` is exposed only when the server
 * sent both `error` (code) and `message` (human text) — e.g. `email_not_verified`.
 */
export async function apiRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })

  const isJson = res.headers.get('content-type')?.includes('application/json') ?? false
  const data = (isJson ? await res.json() : null) as (ApiErrorBody & T) | null

  if (!res.ok) {
    const body = (data ?? {}) as ApiErrorBody
    const code = body.message ? body.error : undefined
    throw new ApiError(body.message ?? body.error ?? 'Something went wrong', res.status, code)
  }
  return data as T
}
