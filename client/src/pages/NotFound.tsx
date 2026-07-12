import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">404 — Not found</h1>
      <Link to="/" className="text-blue-600 underline">
        Go home
      </Link>
    </main>
  )
}
