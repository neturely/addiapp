import { useAuth } from '@/auth/useAuth'

export function Home() {
  const { user, logout } = useAuth()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">AddiApp</h1>
      <p className="text-gray-600">
        Signed in as <span className="font-semibold">{user?.displayName ?? user?.email}</span>
      </p>
      <p className="text-sm text-gray-500">
        (Play mode home comes next — issue #29. You&apos;re authenticated.)
      </p>
      <button
        onClick={() => void logout()}
        className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
      >
        Log out
      </button>
    </main>
  )
}
