import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { Mascot } from '@/components/Mascot'

export function Home() {
  const { user, logout } = useAuth()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
      <Mascot mood="happy" />
      <h1 className="text-3xl font-bold text-gray-800">Ready to do something great today?</h1>
      <p className="text-gray-500">
        Signed in as <span className="font-semibold">{user?.displayName ?? user?.email}</span>
      </p>
      <Link
        to="/play"
        className="rounded-xl bg-[#D85A30] px-8 py-3 text-lg font-semibold text-white transition hover:bg-[#c24d27]"
      >
        Let&apos;s go
      </Link>
      <p className="text-xs text-gray-400">
        (Full Play-mode home is issue #29 — this is a temporary entry.)
      </p>
      <button
        onClick={() => void logout()}
        className="text-sm text-gray-400 underline hover:text-gray-600"
      >
        Log out
      </button>
    </main>
  )
}
