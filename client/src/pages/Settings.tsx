import { useState, type FormEvent, type ReactNode } from 'react'
import { CircleCheck } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useToast } from '@/toast/useToast'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import {
  changePassword,
  deleteAccount,
  logoutOtherDevices,
  requestEmailChange,
  updateAccount,
} from '@/lib/account'

/**
 * Account settings (#266, consolidating #187/#200): one sectioned surface —
 * Profile / Email / Password / Play / Sign out everywhere / Delete account,
 * divider-separated (the prototype's settings view; replaces the three
 * FormCards). The Play section finally wires the Selection::strategies()
 * preference; the danger area holds Sign out everywhere (#304, relocated from
 * the avatar menu) and Delete account (#266, type-to-confirm + password
 * re-auth) as the final, heaviest item.
 */

/**
 * Selection strategies offered (#266) — names must match the server seam
 * (`Selection::strategies()`). Decided: `focusProject` stays a Play MODE, not a
 * persistent strategy — as a stored default it would silently override the
 * win-type choice; the Choice screen's third option is its home.
 */
const STRATEGIES: { value: string; label: string }[] = [
  { value: 'weightedByAge', label: 'Weighted random — favours older tasks' },
  { value: 'oldestFirst', label: 'Oldest first' },
  { value: 'uniformRandom', label: 'Uniform random' },
]

const FIELD =
  'w-full rounded-control bg-field p-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-accent'
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted'
const DELETE_TITLE_ID = 'account-delete-title'

function Section({
  title,
  lede,
  children,
  first = false,
}: {
  title: string
  lede: string
  children: ReactNode
  first?: boolean
}) {
  return (
    <section className={`py-6 ${first ? '' : 'border-t border-field-hover'}`}>
      <h2 className="text-base font-semibold tracking-tight text-gray-800">{title}</h2>
      <p className="mb-4 mt-0.5 text-[13px] leading-relaxed text-muted">{lede}</p>
      <div className="flex max-w-md flex-col gap-3.5">{children}</div>
    </section>
  )
}

export function Settings() {
  const { user, updateUser, logout } = useAuth()
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

  const [strategy, setStrategy] = useState(user?.selectionStrategy ?? 'weightedByAge')
  const [savingStrategy, setSavingStrategy] = useState(false)

  const [signingOutAll, setSigningOutAll] = useState(false)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  async function saveStrategy(next: string) {
    setStrategy(next)
    setSavingStrategy(true)
    try {
      const updated = await updateAccount({ selectionStrategy: next })
      updateUser(updated)
      showToast({ message: 'Play selection updated', icon: CircleCheck, tone: 'success' })
    } catch {
      setStrategy(user?.selectionStrategy ?? 'weightedByAge')
      showToast({ message: 'Could not save that preference.', icon: CircleCheck, tone: 'neutral' })
    } finally {
      setSavingStrategy(false)
    }
  }

  /**
   * "Everywhere" includes THIS device (#304): revoke every other session, then
   * end this one through the normal logout path — ProtectedRoute redirects to
   * /login. Disruptive but fully recoverable, so no confirm modal.
   */
  async function signOutEverywhere() {
    setSigningOutAll(true)
    try {
      await logoutOtherDevices()
    } catch {
      showToast({ message: 'Could not sign out everywhere.', icon: CircleCheck, tone: 'neutral' })
      setSigningOutAll(false)
      return
    }
    await logout()
  }

  async function confirmDelete(e: FormEvent) {
    e.preventDefault()
    setDeleteError(null)
    setDeleting(true)
    try {
      await deleteAccount(deletePassword)
      // Everything server-side is gone and the cookie is cleared — a full
      // reload to the login screen drops all client state with it.
      window.location.assign('/login')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the account.')
      setDeleting(false)
    }
  }

  const deleteArmed = deleteText.trim().toLowerCase() === 'delete' && deletePassword !== ''

  return (
    <main className="flex min-h-screen flex-col p-4 sm:p-6">
      <div className="flex-1 rounded-xl bg-surface">
        {/* Centred like the task view (#256 review) — symmetric whitespace. */}
        <div className="mx-auto max-w-2xl px-6 py-8 sm:px-9">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Account settings</h1>
          <p className="mb-2 mt-1 text-[13px] text-muted">
            Your profile, sign-in details and how AddiApp behaves.
          </p>

          <Section
            first
            title="Profile"
            lede="Shown on your avatar. Leave blank to use your email initial."
          >
            <form onSubmit={saveProfile} className="flex flex-col gap-3.5">
              <div>
                <label htmlFor="displayName" className={LABEL}>
                  Display name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  maxLength={50}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={FIELD}
                />
              </div>
              {profileError && (
                <p role="alert" className="text-sm text-danger-ink">
                  {profileError}
                </p>
              )}
              <div>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </Button>
              </div>
            </form>
          </Section>

          <Section
            title="Email"
            lede="We'll send a confirmation link to the new address. Your email changes only once you click it, and you'll be signed out on your other devices."
          >
            <form onSubmit={saveEmail} className="flex flex-col gap-3.5">
              <div>
                <label htmlFor="currentEmail" className={LABEL}>
                  Current email
                </label>
                <input
                  id="currentEmail"
                  type="email"
                  value={user?.email ?? ''}
                  readOnly
                  className={`${FIELD} text-muted`}
                />
              </div>
              <div>
                <label htmlFor="newEmail" className={LABEL}>
                  New email
                </label>
                <input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  placeholder="you@example.com"
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={FIELD}
                />
              </div>
              {emailError && (
                <p role="alert" className="text-sm text-danger-ink">
                  {emailError}
                </p>
              )}
              {emailSent && (
                <p role="status" className="text-sm text-success-ink">
                  {emailSent}
                </p>
              )}
              <div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={savingEmail || newEmail.trim() === ''}
                >
                  {savingEmail ? 'Sending…' : 'Send confirmation'}
                </Button>
              </div>
            </form>
          </Section>

          <Section
            title="Password"
            lede="At least 8 characters. Changing it signs out your other devices."
          >
            <form onSubmit={savePassword} className="flex flex-col gap-3.5">
              <div>
                <label htmlFor="currentPassword" className={LABEL}>
                  Current password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="newPassword" className={LABEL}>
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={FIELD}
                />
              </div>
              {pwError && (
                <p role="alert" className="text-sm text-danger-ink">
                  {pwError}
                </p>
              )}
              <div>
                <Button type="submit" disabled={savingPw}>
                  {savingPw ? 'Saving…' : 'Change password'}
                </Button>
              </div>
            </form>
          </Section>

          <Section title="Play" lede="How AddiApp picks the next task when you press Play.">
            <div>
              <label htmlFor="selectionStrategy" className={LABEL}>
                Selection
              </label>
              <select
                id="selectionStrategy"
                value={strategy}
                disabled={savingStrategy}
                onChange={(e) => void saveStrategy(e.target.value)}
                className={FIELD}
              >
                {STRATEGIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                “Focus on projects” stays a per-play choice on the Play screen — it isn’t a
                stored default.
              </p>
            </div>
          </Section>

          <Section
            title="Sign out everywhere"
            lede="Ends your session on every device, including this one. You'll just need to sign back in."
          >
            <div>
              <Button
                variant="danger"
                disabled={signingOutAll}
                onClick={() => void signOutEverywhere()}
              >
                {signingOutAll ? 'Signing out…' : 'Sign out everywhere'}
              </Button>
            </div>
          </Section>

          <Section
            title="Delete account"
            lede="Removes your account, every task and project, and your whole points history. This can't be undone and nothing is recoverable afterwards."
          >
            <div>
              <Button variant="danger" size="lg" onClick={() => setConfirmingDelete(true)}>
                Delete my account
              </Button>
            </div>
          </Section>
        </div>
      </div>

      {confirmingDelete && (
        <Modal titleId={DELETE_TITLE_ID} onClose={() => !deleting && setConfirmingDelete(false)}>
          <h2 id={DELETE_TITLE_ID} className="mb-3 text-xl font-bold text-gray-800">
            Delete your account?
          </h2>
          <div className="mb-4 rounded-lg bg-danger-tint px-3.5 py-3 text-[13px] leading-relaxed text-danger-ink">
            Every task, project and point you’ve earned will be permanently deleted. We can’t
            restore any of it.
          </div>
          <form onSubmit={confirmDelete} className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="deleteConfirm" className={LABEL}>
                Type “delete” to confirm
              </label>
              <input
                id="deleteConfirm"
                type="text"
                autoComplete="off"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="delete"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="deletePassword" className={LABEL}>
                Your password
              </label>
              <input
                id="deletePassword"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className={FIELD}
              />
            </div>
            {deleteError && (
              <p role="alert" className="text-sm text-danger-ink">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={!deleteArmed || deleting}>
                {deleting ? 'Deleting…' : 'Delete my account'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  )
}
