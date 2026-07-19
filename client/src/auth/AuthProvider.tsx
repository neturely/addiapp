import { useEffect, useState, type ReactNode } from 'react'
import { apiRequest } from '@/lib/api'
import { setUnauthorizedHandler } from '@/lib/authSignal'
import { AuthContext, type AuthUser } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    apiRequest<{ user: AuthUser }>('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // A 401 on any authenticated call means the session expired mid-use: drop the
  // cached user (ProtectedRoute then redirects) and flag it for the login note.
  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        setUser(null)
        setSessionExpired(true)
      }),
    [],
  )

  async function login(email: string, password: string) {
    const data = await apiRequest<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setSessionExpired(false)
    setUser(data.user)
  }

  async function register(
    email: string,
    password: string,
    displayName?: string,
    captchaToken?: string,
  ) {
    // Account created + verification email sent; the user is NOT signed in.
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName, turnstileToken: captchaToken }),
    })
  }

  async function verify(token: string) {
    const data = await apiRequest<{ user: AuthUser }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
    setUser(data.user)
  }

  async function resendVerification(email: string) {
    await apiRequest('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionExpired,
        login,
        register,
        verify,
        resendVerification,
        logout,
        updateUser: (u) => setUser(u),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
