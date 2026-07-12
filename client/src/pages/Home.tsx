import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { Mascot } from '@/components/Mascot'

/**
 * Play-mode home screen (issue #29, PROJECT_SPEC §5.1). The mascot-guided entry
 * point: a single "Let's go" leading into the choice screen (#30), plus a
 * secondary "Add a task" (#35). Shares the mascot / coral / spacing language of
 * the choice, task-presented, in-progress and completion screens.
 */
export function Home() {
  const { user, logout } = useAuth()

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Mascot mood="happy" />
      <h1 className="max-w-md text-3xl font-bold text-gray-800">
        Ready to do something great today?
      </h1>

      <div className="mt-2 flex flex-col items-center gap-3">
        <Link
          to="/play"
          className="rounded-xl bg-[#D85A30] px-10 py-3 text-lg font-semibold text-white transition hover:bg-[#c24d27]"
        >
          Let&apos;s go
        </Link>
        <div className="flex gap-4 text-sm text-gray-500">
          <Link to="/tasks/new" className="underline hover:text-gray-700">
            Add a task
          </Link>
          <Link to="/dashboard" className="underline hover:text-gray-700">
            Dashboard
          </Link>
          <Link to="/stats" className="underline hover:text-gray-700">
            Stats
          </Link>
        </div>
      </div>

      <footer className="absolute bottom-6 flex flex-col items-center gap-1 text-xs text-gray-400">
        <span>Signed in as {user?.displayName ?? user?.email}</span>
        <button onClick={() => void logout()} className="underline hover:text-gray-600">
          Log out
        </button>
      </footer>
    </main>
  )
}
