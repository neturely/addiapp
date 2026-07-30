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
