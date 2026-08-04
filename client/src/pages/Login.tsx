import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { ApiError } from '@/lib/apiError'

export function Login() {
  const { login, verifyOtp, resendVerification } = useAuth()
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
  // TOTP second step (#319): set when login answered totp_required — the form
  // swaps to a code field carrying this challenge token.
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [usingBackupCode, setUsingBackupCode] = useState(false)

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
      } else if (err instanceof ApiError && err.code === 'totp_required') {
        setChallenge(typeof err.details?.challenge === 'string' ? err.details.challenge : null)
        setCode('')
        setUsingBackupCode(false)
      } else {
        setError(err instanceof Error ? err.message : 'Login failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault()
    if (!challenge) return
    setError(null)
    setSubmitting(true)
    try {
      await verifyOtp(challenge, code)
      navigate('/')
    } catch (err) {
      // An expired challenge sends the user back to the password step.
      if (err instanceof ApiError && err.code === 'totp_challenge_expired') {
        setChallenge(null)
        setPassword('')
      }
      setError(err instanceof Error ? err.message : 'Sign-in failed')
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

  if (challenge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-4">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
          <h1 className="mb-1 text-center text-xl font-bold">Two-factor authentication</h1>
          <p className="mb-4 text-center text-sm text-muted">
            {usingBackupCode
              ? 'Enter one of your single-use backup codes.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>
          <form onSubmit={onSubmitCode} className="space-y-4">
            {/* name/id/label matter here (#343): password managers classify the
                field by these keywords, not by autocomplete — without them the
                lone text input on the login URI gets treated as the username. */}
            <label htmlFor={usingBackupCode ? 'backup-code' : 'otp'} className="sr-only">
              {usingBackupCode ? 'Backup code' : 'Authenticator code'}
            </label>
            <input
              key={usingBackupCode ? 'backup-code' : 'otp'}
              className="w-full rounded-lg bg-gray-100 p-2.5 text-center tracking-widest focus:ring-2 focus:ring-primary focus:outline-none"
              type="text"
              id={usingBackupCode ? 'backup-code' : 'otp'}
              name={usingBackupCode ? 'backup-code' : 'otp'}
              autoFocus
              autoComplete="one-time-code"
              inputMode={usingBackupCode ? 'text' : 'numeric'}
              maxLength={usingBackupCode ? undefined : 6}
              pattern={usingBackupCode ? undefined : '\\d{6}'}
              placeholder={usingBackupCode ? 'xxxxx-xxxxx' : '123456'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || code.trim() === ''}
              className="w-full rounded-lg bg-primary py-2.5 text-xl font-bold text-white transition hover:opacity-90 disabled:bg-gray-400"
            >
              {submitting ? 'Checking…' : 'Verify'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => {
                setUsingBackupCode(!usingBackupCode)
                setCode('')
                setError(null)
              }}
              className="tap-44 text-primary-ink underline"
            >
              {usingBackupCode ? 'Use my authenticator app instead' : 'Use a backup code instead'}
            </button>
          </p>
          <p className="mt-1 text-center text-sm">
            <button
              type="button"
              onClick={() => {
                setChallenge(null)
                setError(null)
                setPassword('')
              }}
              className="tap-44 text-primary-ink underline"
            >
              Back to sign-in
            </button>
          </p>
        </div>
      </div>
    )
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
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
          <Link to="/register" className="tap-44 text-primary-ink underline">
            Register
          </Link>
        </p>
        <p className="mt-1 text-center text-sm">
          <Link to="/forgot-password" className="tap-44 text-primary-ink underline">
            Forgot your password?
          </Link>
        </p>
      </div>
    </div>
  )
}
