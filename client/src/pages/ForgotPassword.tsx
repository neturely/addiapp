import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow">
          <h1 className="mb-2 text-xl font-bold">Check your email 📬</h1>
          <p className="text-sm text-gray-600">
            If an account exists for <strong>{email}</strong>, a password reset link is on its way.
            The link expires in 1 hour.
          </p>
          <p className="mt-4 text-sm">
            <Link to="/login" className="text-blue-600 underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
        <h1 className="mb-1 text-center text-xl font-bold">Forgot your password?</h1>
        <p className="mb-4 text-center text-sm text-gray-500">
          Enter your email and we&apos;ll send a reset link.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded border p-2"
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
            className="w-full rounded bg-blue-600 py-2 text-white disabled:bg-gray-400"
          >
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-blue-600 underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
