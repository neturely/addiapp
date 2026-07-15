import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { apiRequest } from '@/lib/api'

/**
 * Set a new password from a reset link (issue #62). Reads the token from the URL,
 * posts it with the new password, and on success sends the user to sign in
 * (the server has invalidated all their old sessions).
 */
export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-4">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center">
          <h1 className="mb-2 text-xl font-bold">Invalid reset link</h1>
          <p className="text-sm text-muted">This link is missing its reset token.</p>
          <p className="mt-4 text-sm">
            <Link to="/forgot-password" className="text-primary-ink underline">
              Request a new link
            </Link>
          </p>
        </div>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-4">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center">
          <CircleCheck className="mx-auto mb-3 h-10 w-10 text-success-ink" />
          <h1 className="mb-2 text-xl font-bold">Password reset</h1>
          <p className="text-sm text-muted">Sending you to sign in with your new password…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h1 className="mb-4 text-center text-xl font-bold">Choose a new password</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
            type="password"
            autoComplete="new-password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary py-2.5 text-xl font-bold text-white transition hover:opacity-90 disabled:bg-gray-400"
          >
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-primary-ink underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
