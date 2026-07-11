import { useEffect, useState } from 'react'

type ApiState = 'checking…' | 'unreachable' | string

export function Home() {
  const [apiStatus, setApiStatus] = useState<ApiState>('checking…')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { status?: string }) => setApiStatus(data.status ?? 'unknown'))
      .catch(() => setApiStatus('unreachable'))
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">AddiApp</h1>
      <p className="text-gray-500">Monorepo scaffold is up — rebuild in progress.</p>
      <p className="text-sm text-gray-600">
        API health: <span className="font-mono font-semibold">{apiStatus}</span>
      </p>
    </main>
  )
}
