import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { ApiError } from '@/lib/apiError'

export function Login() {
  const { login, resendVerification } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Set when ProtectedRoute bounced the user here after a mid-use session expiry
  // (#101). A courtesy note only — clears naturally on manual refresh.
  const sessionExpired = (location.state as { sessionExpired?: boolean } | null)?.sessionExpired
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsVerify, setNeedsVerify] = useState(false)
  const [resent, setResent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNeedsVerify(false)
    setResent(false)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') {
        setNeedsVerify(true)
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Login failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function onResend() {
    try {
      await resendVerification(email)
    } finally {
      setResent(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h1 className="mb-4 text-center text-xl font-bold">Sign in to AddiApp</h1>
        {sessionExpired && !error && (
          <p className="mb-4 text-center text-sm text-muted">
            Your session expired — please sign in again.
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {needsVerify && !resent && (
            <button
              type="button"
              onClick={onResend}
              className="w-full rounded-lg bg-gray-100 py-2 text-sm hover:bg-gray-200"
            >
              Resend verification email
            </button>
          )}
          {resent && (
            <p className="text-sm text-success-ink">
              If that account is unverified, a new link is on its way.
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary py-2.5 text-xl font-bold text-white transition hover:opacity-90 disabled:bg-gray-400"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          No account?{' '}
          <Link to="/register" className="text-primary-ink underline">
            Register
          </Link>
        </p>
        <p className="mt-1 text-center text-sm">
          <Link to="/forgot-password" className="text-primary-ink underline">
            Forgot your password?
          </Link>
        </p>
      </div>
    </div>
  )
}
