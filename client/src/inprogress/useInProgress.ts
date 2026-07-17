import { useContext } from 'react'
import { InProgressContext } from './inProgressContext'

export function useInProgress() {
  const ctx = useContext(InProgressContext)
  if (!ctx) throw new Error('useInProgress must be used within InProgressProvider')
  return ctx
}
