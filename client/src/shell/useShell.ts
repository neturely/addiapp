import { useContext } from 'react'
import { ShellContext } from './shellContext'

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within the AppLayout shell')
  return ctx
}
