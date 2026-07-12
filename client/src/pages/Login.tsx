import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { ApiError } from '@/lib/apiError'

export function Login() {
  const { login, resendVerification } = useAuth()
  const navigate = useNavigate()
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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
        <h1 className="mb-4 text-center text-xl font-bold">Sign in to AddiApp</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded border p-2"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded border p-2"
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
              className="w-full rounded border border-gray-300 py-2 text-sm hover:bg-gray-50"
            >
              Resend verification email
            </button>
          )}
          {resent && (
            <p className="text-sm text-green-600">
              If that account is unverified, a new link is on its way.
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-blue-600 py-2 text-white disabled:bg-gray-400"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          No account?{' '}
          <Link to="/register" className="text-blue-600 underline">
            Register
          </Link>
        </p>
        <p className="mt-1 text-center text-sm">
          <Link to="/forgot-password" className="text-blue-600 underline">
            Forgot your password?
          </Link>
        </p>
      </div>
    </div>
  )
}
