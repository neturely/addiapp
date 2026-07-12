import { useEffect, useState, type ReactNode } from 'react'
import { apiRequest } from '@/lib/api'
import { AuthContext, type AuthUser } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest<{ user: AuthUser }>('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const data = await apiRequest<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setUser(data.user)
  }

  async function register(email: string, password: string, displayName?: string) {
    // Account created + verification email sent; the user is NOT signed in.
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
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
      value={{ user, loading, login, register, verify, resendVerification, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}
