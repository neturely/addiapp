import { useContext } from 'react'
import { ToastContext } from './toastContext'

/** Access the app-wide toast controller (#176). Must be under a ToastProvider. */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
