import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow">
        {status === 'verifying' && <p className="text-gray-600">Verifying your email…</p>}
        {status === 'success' && (
          <>
            <h1 className="mb-2 text-xl font-bold">Email verified ✅</h1>
            <p className="text-sm text-gray-600">Signing you in…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="mb-2 text-xl font-bold">Verification failed</h1>
            <p className="text-sm text-red-600">{message}</p>
            <p className="mt-4 text-sm">
              <Link to="/login" className="text-blue-600 underline">
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
