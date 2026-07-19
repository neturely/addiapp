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
