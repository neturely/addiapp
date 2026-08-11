import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Loading } from '@/components/Loading'

export function ProtectedRoute() {
  const { user, loading, sessionExpired } = useAuth()
  if (loading) return <Loading page />
  // `sessionExpired` is only ever true after a mid-use 401, so a never-signed-in
  // visitor redirects here with it false and the login note stays hidden (#101).
  if (!user) return <Navigate to="/login" replace state={{ sessionExpired }} />
  return <Outlet />
}
