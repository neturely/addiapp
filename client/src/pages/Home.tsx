import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { fetchTasks, type Task } from '@/lib/tasks'

/** Most recently started task first (falls back to newest id). */
function mostRecentlyStarted(tasks: Task[]): Task | null {
  if (tasks.length === 0) return null
  return [...tasks].sort((a, b) => {
    const at = a.startedAt ? Date.parse(a.startedAt) : 0
    const bt = b.startedAt ? Date.parse(b.startedAt) : 0
    return bt - at || b.id - a.id
  })[0]
}

/**
 * Play-mode home screen (issue #29, PROJECT_SPEC §5.1). The mascot-guided entry
 * point: a single "Let's go" leading into the choice screen (#30), plus a
 * secondary "Add a task" (#35). If a task is mid-flight it surfaces a Resume
 * affordance (#69) so a started-but-unfinished task isn't stranded — Play-mode
 * selection only offers backlog tasks, so this is the way back to an active one.
 */
export function Home() {
  const [inProgress, setInProgress] = useState<Task[]>([])

  useEffect(() => {
    fetchTasks('in_progress')
      .then(setInProgress)
      .catch(() => undefined) // resume is a bonus; never block the home screen
  }, [])

  const resume = mostRecentlyStarted(inProgress)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Mascot expression="neutral" />
      <h1 className="max-w-md text-3xl font-bold text-gray-800">
        Ready to do something great today?
      </h1>

      {resume && (
        <Link
          to={`/play/progress/${resume.id}`}
          className="flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-accent-tint px-6 py-3 font-semibold text-accent-ink transition hover:opacity-90"
        >
          <Play className="h-4 w-4 shrink-0" fill="currentColor" strokeWidth={0} />
          Resume: <span className="max-w-[16rem] truncate">{resume.title}</span>
        </Link>
      )}

      <Link
        to="/play"
        className="mt-2 rounded-xl bg-primary px-10 py-3 text-xl font-bold text-white transition hover:opacity-90"
      >
        Let&apos;s go
      </Link>
    </main>
  )
}
