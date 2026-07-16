import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'

export function ProtectedRoute() {
  const { user, loading, sessionExpired } = useAuth()
  if (loading) return <p className="p-8 text-center text-gray-500">Loading…</p>
  // `sessionExpired` is only ever true after a mid-use 401, so a never-signed-in
  // visitor redirects here with it false and the login note stays hidden (#101).
  if (!user) return <Navigate to="/login" replace state={{ sessionExpired }} />
  return <Outlet />
}
