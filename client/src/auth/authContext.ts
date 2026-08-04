import { createContext } from 'react'

export type AuthUser = {
  id: number
  email: string
  displayName: string | null
  // MD5 of the normalized email, computed server-side (#174) for the Gravatar
  // avatar. Optional so a stale cached response degrades to the initials avatar.
  gravatarHash?: string
  /** Play selection strategy (#266); optional for stale cached responses. */
  selectionStrategy?: string
  /** TOTP 2FA armed (#319); optional for stale cached responses. */
  totpEnabled?: boolean
}

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  // True when the session expired mid-use (a 401 cleared the user), so the
  // login screen can show a low-key courtesy note. Reset on successful login.
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<void>
  /** Second login step when TOTP 2FA is armed (#319): the challenge token from
   *  the login 403 + an authenticator (or backup) code. Signs in on success. */
  verifyOtp: (challenge: string, code: string) => Promise<void>
  // Creates the account and triggers a verification email. Does NOT sign in —
  // the user must verify first.
  register: (
    email: string,
    password: string,
    displayName?: string,
    captchaToken?: string,
  ) => Promise<void>
  // Confirms an email token and signs the user in on success.
  verify: (token: string) => Promise<void>
  resendVerification: (email: string) => Promise<void>
  logout: () => Promise<void>
  /** Replace the cached user after an account change (e.g. Settings, #187). */
  updateUser: (user: AuthUser) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
