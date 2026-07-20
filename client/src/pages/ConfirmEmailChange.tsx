import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { confirmEmailChange } from '@/lib/account'

type Status = 'confirming' | 'success' | 'error'

/**
 * Landing for the email-change confirm link (#200). Token-based: confirms the
 * pending email swap. The server revokes all sessions on success, so the user
 * re-signs-in with the new address — no auto-login here (unlike Verify).
 */
export function ConfirmEmailChange() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<Status>('confirming')
  const [message, setMessage] = useState('')
  // Guard React StrictMode's double-invoke from consuming the single-use token twice.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('This link is missing its confirmation token.')
      return
    }
    confirmEmailChange(token)
      .then((res) => {
        setStatus('success')
        setMessage(res.message)
      })
      .catch((err: unknown) => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Could not confirm the change.')
      })
  }, [params])

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center">
        {status === 'confirming' && <p className="text-muted">Confirming your new email…</p>}
        {status === 'success' && (
          <>
            <CircleCheck className="mx-auto mb-3 h-10 w-10 text-success-ink" />
            <h1 className="mb-2 text-xl font-bold">Email updated</h1>
            <p className="text-sm text-muted">{message}</p>
            <p className="mt-4 text-sm">
              {/* Hard navigation (real <a>, not <Link>): the server revoked every
                  session on confirm, but this SPA still holds a cached `user` in
                  memory. A full reload clears it so we don't land in a "ghost
                  logged-in" state before the next 401. */}
              <a href="/login" className="text-primary-ink underline">
                Sign in
              </a>{' '}
              with your new address.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="mb-2 text-xl font-bold">Couldn&apos;t confirm</h1>
            <p role="alert" className="text-sm text-red-600">
              {message}
            </p>
            <p className="mt-4 text-sm">
              <Link to="/settings" className="text-primary-ink underline">
                Back to settings
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
