import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'

export function Register() {
  const { register, resendVerification } = useAuth()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [resent, setResent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(email, password, displayName.trim() || undefined)
      setRegistered(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-4">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center">
          <Mail className="mx-auto mb-3 h-10 w-10 text-primary-ink" />
          <h1 className="mb-2 text-xl font-bold">Check your email</h1>
          <p className="text-sm text-muted">
            We sent a verification link to <strong className="text-gray-700">{email}</strong>. Click
            it to activate your account, then sign in.
          </p>
          <button
            onClick={onResend}
            className="mt-4 w-full rounded-lg bg-gray-100 py-2 text-sm hover:bg-gray-200"
          >
            Resend verification email
          </button>
          {resent && (
            <p className="mt-2 text-sm text-success-ink">
              If that account is unverified, a new link is on its way.
            </p>
          )}
          <p className="mt-4 text-sm">
            <Link to="/login" className="text-primary-ink underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h1 className="mb-4 text-center text-xl font-bold">Create your AddiApp account</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
            type="text"
            autoComplete="nickname"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
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
            autoComplete="new-password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary py-2.5 font-semibold text-white transition hover:opacity-90 disabled:bg-gray-400"
          >
            {submitting ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-ink underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
