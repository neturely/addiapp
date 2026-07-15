import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { apiRequest } from '@/lib/api'

/**
 * Request a password reset (issue #62). Always shows the same confirmation
 * regardless of whether the account exists — no account enumeration (the server
 * is likewise non-enumerating and rate-limited).
 */
export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
    } catch {
      // Swallow — never reveal whether the account exists.
    } finally {
      setSent(true)
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-4">
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center">
          <Mail className="mx-auto mb-3 h-10 w-10 text-primary" />
          <h1 className="mb-2 text-xl font-bold">Check your email</h1>
          <p className="text-sm text-muted">
            If an account exists for <strong className="text-gray-700">{email}</strong>, a password
            reset link is on its way. The link expires in 1 hour.
          </p>
          <p className="mt-4 text-sm">
            <Link to="/login" className="text-primary underline">
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
        <h1 className="mb-1 text-center text-xl font-bold">Forgot your password?</h1>
        <p className="mb-4 text-center text-sm text-muted">
          Enter your email and we&apos;ll send a reset link.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary py-2.5 font-semibold text-white transition hover:opacity-90 disabled:bg-gray-400"
          >
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-primary underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
