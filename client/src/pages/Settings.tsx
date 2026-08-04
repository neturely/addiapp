import { useState, type FormEvent, type ReactNode } from 'react'
import { CircleCheck } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useToast } from '@/toast/useToast'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import {
  changePassword,
  confirmTotp,
  deleteAccount,
  disableTotp,
  logoutOtherDevices,
  requestEmailChange,
  setupTotp,
  updateAccount,
} from '@/lib/account'

/**
 * Account settings (#266, consolidating #187/#200): one sectioned surface —
 * Profile / Email / Password / Play / Sign out / Delete account,
 * divider-separated (the prototype's settings view; replaces the three
 * FormCards). The Play section finally wires the Selection::strategies()
 * preference; the danger area holds the "Sign out" section (#304, relocated
 * from the avatar menu; its button acts everywhere — this device included) and
 * Delete account (#266, type-to-confirm + password re-auth) as the final,
 * heaviest item.
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
const TOTP_TITLE_ID = 'totp-enroll-title'

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

/**
 * Two-factor authentication (#319): optional TOTP, off by default. Enrollment
 * is password → secret/otpauth URI (manual entry — no QR dependency, v1) →
 * code confirm → backup codes shown exactly once behind an "I saved these"
 * acknowledgement. Disable needs password + a current code (or a backup code).
 */
function TotpSection() {
  const { user, updateUser } = useAuth()
  const { showToast } = useToast()
  const enabled = user?.totpEnabled === true

  // Enable flow
  const [setupPassword, setSetupPassword] = useState('')
  const [startingSetup, setStartingSetup] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)

  // Disable flow
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disabling, setDisabling] = useState(false)
  const [disableError, setDisableError] = useState<string | null>(null)

  async function startSetup(e: FormEvent) {
    e.preventDefault()
    setSetupError(null)
    setStartingSetup(true)
    try {
      const staged = await setupTotp(setupPassword)
      setEnrollment(staged)
      setConfirmCode('')
      setConfirmError(null)
      setBackupCodes(null)
      setCopied(false)
      setSetupPassword('')
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Could not start the setup.')
    } finally {
      setStartingSetup(false)
    }
  }

  async function confirmEnrollment(e: FormEvent) {
    e.preventDefault()
    setConfirmError(null)
    setConfirming(true)
    try {
      const { backupCodes: codes } = await confirmTotp(confirmCode)
      setBackupCodes(codes)
      if (user) updateUser({ ...user, totpEnabled: true })
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Could not confirm the code.')
    } finally {
      setConfirming(false)
    }
  }

  function finishEnrollment() {
    setEnrollment(null)
    setBackupCodes(null)
    showToast({ message: 'Two-factor authentication is on', icon: CircleCheck, tone: 'success' })
  }

  async function submitDisable(e: FormEvent) {
    e.preventDefault()
    setDisableError(null)
    setDisabling(true)
    try {
      await disableTotp(disablePassword, disableCode)
      if (user) updateUser({ ...user, totpEnabled: false })
      setDisablePassword('')
      setDisableCode('')
      showToast({ message: 'Two-factor authentication is off', icon: CircleCheck, tone: 'neutral' })
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : 'Could not turn off two-factor auth.')
    } finally {
      setDisabling(false)
    }
  }

  async function copySecret() {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setCopied(true)
    } catch {
      // Clipboard unavailable — the secret is selectable text, so no toast needed.
    }
  }

  return (
    <>
      <Section
        title="Two-factor authentication"
        lede={
          enabled
            ? 'On — signing in asks for a code from your authenticator app. Turning it off needs your password and a current code (or a backup code).'
            : 'Add a second sign-in step: a 6-digit code from an authenticator app (Google Authenticator, 1Password, Aegis…). Optional, and you get backup codes in case you lose the app.'
        }
      >
        {enabled ? (
          <form onSubmit={submitDisable} className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="totpDisablePassword" className={LABEL}>
                Your password
              </label>
              <input
                id="totpDisablePassword"
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="totpDisableCode" className={LABEL}>
                Authenticator or backup code
              </label>
              <input
                id="totpDisableCode"
                type="text"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className={FIELD}
              />
            </div>
            {disableError && (
              <p role="alert" className="text-sm text-danger-ink">
                {disableError}
              </p>
            )}
            <div>
              <Button
                type="submit"
                variant="danger"
                disabled={disabling || disablePassword === '' || disableCode.trim() === ''}
              >
                {disabling ? 'Turning off…' : 'Turn off two-factor auth'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={startSetup} className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="totpSetupPassword" className={LABEL}>
                Your password
              </label>
              <input
                id="totpSetupPassword"
                type="password"
                autoComplete="current-password"
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                className={FIELD}
              />
            </div>
            {setupError && (
              <p role="alert" className="text-sm text-danger-ink">
                {setupError}
              </p>
            )}
            <div>
              <Button type="submit" disabled={startingSetup || setupPassword === ''}>
                {startingSetup ? 'Starting…' : 'Set up two-factor auth'}
              </Button>
            </div>
          </form>
        )}
      </Section>

      {enrollment && (
        <Modal
          titleId={TOTP_TITLE_ID}
          onClose={() => {
            // Backup codes are shown exactly once — closing that step is the
            // same as acknowledging them. A merely-staged secret is harmless
            // to abandon (login is untouched until confirm).
            if (backupCodes) finishEnrollment()
            else if (!confirming) setEnrollment(null)
          }}
        >
          {backupCodes ? (
            <>
              <h2 id={TOTP_TITLE_ID} className="mb-3 text-xl font-bold text-gray-800">
                Save your backup codes
              </h2>
              <p className="mb-3 text-sm leading-relaxed text-muted">
                Each code signs you in once if you lose your authenticator. This is the only
                time they're shown — keep them somewhere safe.
              </p>
              <ul className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-field px-4 py-3 font-mono text-sm text-gray-800">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button onClick={finishEnrollment}>I saved these codes</Button>
              </div>
            </>
          ) : (
            <>
              <h2 id={TOTP_TITLE_ID} className="mb-3 text-xl font-bold text-gray-800">
                Connect your authenticator
              </h2>
              <p className="mb-3 text-sm leading-relaxed text-muted">
                Add AddiApp in your authenticator app by entering this secret key (or pasting
                the setup link), then confirm with the 6-digit code it shows.
              </p>
              <div className="mb-3 rounded-lg bg-field px-4 py-3">
                <p className={LABEL}>Secret key</p>
                <p className="font-mono text-sm break-all text-gray-800">{enrollment.secret}</p>
                <button
                  type="button"
                  onClick={() => void copySecret()}
                  className="tap-44 mt-1.5 text-sm text-primary-ink underline"
                >
                  {copied ? 'Copied' : 'Copy secret'}
                </button>
              </div>
              <p className="mb-3 text-xs break-all text-muted">{enrollment.otpauthUri}</p>
              <form onSubmit={confirmEnrollment} className="flex flex-col gap-3.5">
                <div>
                  <label htmlFor="totpConfirmCode" className={LABEL}>
                    6-digit code
                  </label>
                  <input
                    id="totpConfirmCode"
                    type="text"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="123456"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    className={FIELD}
                  />
                </div>
                {confirmError && (
                  <p role="alert" className="text-sm text-danger-ink">
                    {confirmError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" disabled={confirming} onClick={() => setEnrollment(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={confirming || confirmCode.trim().length !== 6}>
                    {confirming ? 'Confirming…' : 'Turn on'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </Modal>
      )}
    </>
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

          <TotpSection />

          {/* ONE danger section (#330 — consolidates the #304 Sign out and #266
              Delete sections): two same-size buttons. */}
          <Section
            title="Account"
            lede="Sign out everywhere ends your session on every device, including this one — you just sign back in. Deleting your account removes every task, project and point permanently; nothing is recoverable."
          >
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="danger"
                disabled={signingOutAll}
                onClick={() => void signOutEverywhere()}
              >
                {signingOutAll ? 'Signing out…' : 'Sign out everywhere'}
              </Button>
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
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
