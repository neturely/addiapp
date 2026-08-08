import { createBrowserRouter, Navigate } from 'react-router'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Verify } from '@/pages/Verify'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { ConfirmEmailChange } from '@/pages/ConfirmEmailChange'
import { Choice } from '@/pages/Choice'
import { TaskPresented } from '@/pages/TaskPresented'
import { InProgress } from '@/pages/InProgress'
import { TaskView } from '@/pages/TaskView'
import { Dashboard } from '@/pages/Dashboard'
import { Stats } from '@/pages/Stats'
import { HowPointsWork } from '@/pages/HowPointsWork'
import { Notifications } from '@/pages/Notifications'
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
          // The open-in-place task view (#262) — the ONE task surface: create
          // (/tasks/new, #256 review — the AddTask page is gone), edit, and the
          // old /tasks/:id/edit deep links all land here.
          { path: '/tasks/new', element: <TaskView /> },
          { path: '/tasks/:id', element: <TaskView /> },
          { path: '/tasks/:id/edit', element: <TaskView /> },
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/stats', element: <Stats /> },
          // The friendly scoring guide (#385) — linked from the avatar menu
          // and the ? icons on the points panels.
          { path: '/how-points-work', element: <HowPointsWork /> },
          { path: '/notifications', element: <Notifications /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
])
