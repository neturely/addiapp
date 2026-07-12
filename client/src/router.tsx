import { createBrowserRouter } from 'react-router-dom'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Choice } from '@/pages/Choice'
import { TaskPresented } from '@/pages/TaskPresented'
import { InProgress } from '@/pages/InProgress'
import { NotFound } from '@/pages/NotFound'
import { ProtectedRoute } from '@/components/ProtectedRoute'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/play', element: <Choice /> },
      { path: '/play/task', element: <TaskPresented /> },
      { path: '/play/progress/:id', element: <InProgress /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])
