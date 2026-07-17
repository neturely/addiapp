function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Elapsed seconds → M:SS, or H:MM:SS past an hour. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * Whole seconds since an ISO `startedAt` (server-anchored, so timers survive a
 * refresh — #33). Falls back to `now` (0 elapsed) when unset. Shared by the
 * InProgress screen and the header timer chip (#135).
 */
export function elapsedSecondsSince(startedAt: string | null | undefined, now = Date.now()): number {
  const start = startedAt ? Date.parse(startedAt) : now
  return Math.max(0, Math.floor((now - start) / 1000))
}
