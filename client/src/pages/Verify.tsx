import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'

type Status = 'verifying' | 'success' | 'error'

export function Verify() {
  const { verify } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState('')
  // Guard against React StrictMode's double-invoke consuming the single-use token twice.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('This link is missing its verification token.')
      return
    }
    verify(token)
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate('/', { replace: true }), 1200)
      })
      .catch((err: unknown) => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed.')
      })
  }, [params, verify, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center">
        {status === 'verifying' && <p className="text-muted">Verifying your email…</p>}
        {status === 'success' && (
          <>
            <CircleCheck className="mx-auto mb-3 h-10 w-10 text-success-ink" />
            <h1 className="mb-2 text-xl font-bold">Email verified</h1>
            <p className="text-sm text-muted">Signing you in…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="mb-2 text-xl font-bold">Verification failed</h1>
            <p role="alert" className="text-sm text-red-600">{message}</p>
            <p className="mt-4 text-sm">
              <Link to="/login" className="text-primary-ink underline">
                Back to sign in
              </Link>{' '}
              to request a new link.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
