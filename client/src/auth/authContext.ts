import { createContext } from 'react'

export type AuthUser = { id: number; email: string; displayName: string | null }

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  // Creates the account and triggers a verification email. Does NOT sign in —
  // the user must verify first.
  register: (email: string, password: string, displayName?: string) => Promise<void>
  // Confirms an email token and signs the user in on success.
  verify: (token: string) => Promise<void>
  resendVerification: (email: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
