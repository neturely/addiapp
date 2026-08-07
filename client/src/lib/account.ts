import { apiRequest } from './api'
import type { AuthUser } from '@/auth/authContext'

/** Update the display name and/or Play selection strategy (#187, #266). */
export async function updateAccount(input: {
  displayName?: string
  selectionStrategy?: string
}): Promise<AuthUser> {
  const { user } = await apiRequest<{ user: AuthUser }>('/account', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return user
}

/** Revoke every OTHER session (#266) — the "Sign out other devices" action. */
export async function logoutOtherDevices(): Promise<void> {
  await apiRequest<void>('/auth/logout-others', { method: 'POST' })
}

/** Permanently delete the account (#266). Requires the current password. */
export async function deleteAccount(password: string): Promise<void> {
  await apiRequest<void>('/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}

/** Start TOTP 2FA enrollment (#319) — password re-auth; returns the staged
 *  secret + otpauth URI for the authenticator app. Not armed until confirmed. */
export async function setupTotp(password: string): Promise<{ secret: string; otpauthUri: string }> {
  return apiRequest<{ secret: string; otpauthUri: string }>('/account/totp/setup', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

/** Arm TOTP 2FA with one valid code (#319). Returns the single-use backup
 *  codes — shown exactly once, never retrievable again. */
export async function confirmTotp(code: string): Promise<{ backupCodes: string[] }> {
  return apiRequest<{ backupCodes: string[] }>('/account/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

/** Disable TOTP 2FA (#319) — password + an authenticator (or backup) code. */
export async function disableTotp(password: string, code: string): Promise<void> {
  await apiRequest<void>('/account/totp/disable', {
    method: 'POST',
    body: JSON.stringify({ password, code }),
  })
}

/** Change the password (#187) — requires the current one; keeps this session. */
export async function changePassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  await apiRequest<void>('/account/password', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Request an email change (#200) — sends a confirm link to the new address.
 *  Response is neutral (non-enumerating); the swap happens on confirm. */
export async function requestEmailChange(input: { email: string }): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/account/email', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Confirm an email change from the emailed token (#200). Revokes all sessions. */
export async function confirmEmailChange(token: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/confirm-email-change', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}
