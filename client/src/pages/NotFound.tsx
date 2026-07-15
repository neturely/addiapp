import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page p-8 text-center">
      <h1 className="text-2xl font-bold text-gray-800">404 — Not found</h1>
      <Link to="/" className="text-primary underline">
        Go home
      </Link>
    </main>
  )
}
