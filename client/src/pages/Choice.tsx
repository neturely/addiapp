import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '@/components/Mascot'
import type { WinSize } from '@/lib/tasks'

/** Time-available presets (minutes). null = "any amount of time". */
const TIME_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Any time', minutes: null },
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
]

/**
 * Play-mode choice screen (issue #30): "What kind of win do you want?" plus a
 * time-available filter. Picking a win type carries both selections into the
 * task-presented screen (#31) as URL params, so the pick is shareable/reloadable.
 */
export function Choice() {
  const navigate = useNavigate()
  const [minutes, setMinutes] = useState<number | null>(null)

  function go(size: WinSize) {
    const params = new URLSearchParams({ size })
    if (minutes != null) params.set('minutes', String(minutes))
    navigate(`/play/task?${params.toString()}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <Mascot mood="thinking" />
      <h1 className="text-2xl font-bold text-gray-800">What kind of win do you want?</h1>

      <div className="w-full max-w-md">
        <p className="mb-2 text-sm font-medium text-gray-500">How much time do you have?</p>
        <div className="flex flex-wrap justify-center gap-2">
          {TIME_OPTIONS.map((opt) => {
            const active = minutes === opt.minutes
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setMinutes(opt.minutes)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-gray-800 text-white'
                    : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid w-full max-w-md gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => go('small')}
          className="rounded-2xl border-2 border-[#2FA39B] bg-[#2FA39B]/10 p-6 text-left transition hover:bg-[#2FA39B]/20"
        >
          <div className="text-lg font-bold text-[#1f746e]">Something small</div>
          <div className="text-sm text-gray-600">A quick, low-effort win</div>
        </button>
        <button
          type="button"
          onClick={() => go('big')}
          className="rounded-2xl border-2 border-[#D85A30] bg-[#D85A30]/10 p-6 text-left transition hover:bg-[#D85A30]/20"
        >
          <div className="text-lg font-bold text-[#a8431f]">Something big</div>
          <div className="text-sm text-gray-600">Real progress worth more points</div>
        </button>
      </div>
    </main>
  )
}
