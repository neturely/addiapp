import { useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useToast } from '@/toast/useToast'
import { FormCard } from '@/components/FormCard'
import { changePassword, requestEmailChange, updateAccount } from '@/lib/account'

/**
 * Account settings (#187): username (display name) + password. Email display is
 * read-only for now — changing it is its own re-verification flow (#200). This is
 * also the future home for preferences (e.g. task-selection strategy).
 */
export function Settings() {
  const { user, updateUser } = useAuth()
  const { showToast } = useToast()

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setProfileError(null)
    setSavingProfile(true)
    try {
      const updated = await updateAccount({ displayName: displayName.trim() })
      updateUser(updated)
      showToast({ message: 'Profile updated', icon: CircleCheck, tone: 'success' })
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setEmailSent(null)
    setSavingEmail(true)
    try {
      const { message } = await requestEmailChange({ email: newEmail.trim() })
      setEmailSent(message)
      setNewEmail('')
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not request the change.')
    } finally {
      setSavingEmail(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setPwError(null)
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.')
      return
    }
    setSavingPw(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      showToast({ message: 'Password changed', icon: CircleCheck, tone: 'success' })
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change your password.')
    } finally {
      setSavingPw(false)
    }
  }

  const field = 'w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none'
  const cta =
    'cursor-pointer rounded-lg bg-primary px-6 py-2.5 text-xl font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400'

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Settings</h1>

      <FormCard title="Profile" className="mb-6">
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-gray-600">
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              maxLength={50}
              placeholder="Your name"
              onChange={(e) => setDisplayName(e.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-muted">
              Shown on your avatar. Leave blank to use your email initial.
            </p>
          </div>
          {profileError && (
            <p role="alert" className="text-sm text-red-600">
              {profileError}
            </p>
          )}
          <button type="submit" disabled={savingProfile} className={cta}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </FormCard>

      <FormCard title="Email" className="mb-6">
        <form onSubmit={saveEmail} className="space-y-4">
          <div>
            <label htmlFor="currentEmail" className="mb-1 block text-sm font-medium text-gray-600">
              Current email
            </label>
            <input
              id="currentEmail"
              type="email"
              value={user?.email ?? ''}
              disabled
              className={`${field} text-muted`}
            />
          </div>
          <div>
            <label htmlFor="newEmail" className="mb-1 block text-sm font-medium text-gray-600">
              New email
            </label>
            <input
              id="newEmail"
              type="email"
              autoComplete="email"
              value={newEmail}
              placeholder="you@example.com"
              onChange={(e) => setNewEmail(e.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-muted">
              We'll email a confirmation link to the new address; your email changes only after you
              click it (and you'll be signed out on your other devices).
            </p>
          </div>
          {emailError && (
            <p role="alert" className="text-sm text-red-600">
              {emailError}
            </p>
          )}
          {emailSent && (
            <p role="status" className="text-sm text-success-ink">
              {emailSent}
            </p>
          )}
          <button type="submit" disabled={savingEmail} className={cta}>
            {savingEmail ? 'Sending…' : 'Send confirmation'}
          </button>
        </form>
      </FormCard>

      <FormCard title="Password">
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-gray-600">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-gray-600">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-muted">
              At least 8 characters. Signs out your other devices.
            </p>
          </div>
          {pwError && (
            <p role="alert" className="text-sm text-red-600">
              {pwError}
            </p>
          )}
          <button type="submit" disabled={savingPw} className={cta}>
            {savingPw ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </FormCard>
    </main>
  )
}
