import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Verify } from '@/pages/Verify'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { ConfirmEmailChange } from '@/pages/ConfirmEmailChange'
import { Choice } from '@/pages/Choice'
import { TaskPresented } from '@/pages/TaskPresented'
import { InProgress } from '@/pages/InProgress'
import { AddTask } from '@/pages/AddTask'
import { EditTask } from '@/pages/EditTask'
import { Dashboard } from '@/pages/Dashboard'
import { Stats } from '@/pages/Stats'
import { Settings } from '@/pages/Settings'
import { NotFound } from '@/pages/NotFound'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/verify', element: <Verify /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset', element: <ResetPassword /> },
  { path: '/confirm-email-change', element: <ConfirmEmailChange /> },
  {
    // ProtectedRoute gates; AppLayout wraps every authed route in the shared
    // Header/Footer shell at one seam (visual refresh v2, #92).
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Home retired (#191): Choice is the Play-mode landing. `/` redirects
          // to the canonical /play (still gated by ProtectedRoute above).
          { path: '/', element: <Navigate to="/play" replace /> },
          { path: '/play', element: <Choice /> },
          { path: '/play/task', element: <TaskPresented /> },
          { path: '/play/progress/:id', element: <InProgress /> },
          { path: '/tasks/new', element: <AddTask /> },
          { path: '/tasks/:id/edit', element: <EditTask /> },
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/stats', element: <Stats /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
])
