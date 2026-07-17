import { createContext } from 'react'
import type { Task } from '@/lib/tasks'

export type InProgressContextValue = {
  /** Most-recently-started in-progress task, or null when nothing is in progress. */
  activeTask: Task | null
  /** Re-fetch the active task — call after a start/complete that doesn't navigate. */
  refresh: () => Promise<void>
}

export const InProgressContext = createContext<InProgressContextValue | null>(null)
