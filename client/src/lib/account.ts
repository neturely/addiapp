import { apiRequest } from './api'
import type { AuthUser } from '@/auth/authContext'

/** Update the display name (#187). Returns the refreshed public user. */
export async function updateAccount(input: { displayName: string }): Promise<AuthUser> {
  const { user } = await apiRequest<{ user: AuthUser }>('/account', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return user
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
