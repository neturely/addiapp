import { useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile widget (#79). Renders the challenge and hands the parent a
 * verification token via `onToken`. The token is single-use and expires, so the
 * parent should remount this component (bump a React `key`) after each submit to
 * get a fresh one.
 *
 * When VITE_TURNSTILE_SITE_KEY is unset the widget renders nothing and the token
 * stays empty — the PHP backend likewise skips verification when it has no
 * secret, so local dev needs no Cloudflare account.
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => {
        // Drop the cached rejected promise (and the dead <script>) so a later
        // remount can retry after a transient CDN/network failure — otherwise the
        // rejection sticks forever and the widget never recovers.
        scriptPromise = null
        s.remove()
        reject(new Error('Failed to load Turnstile'))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

type Props = {
  onToken: (token: string) => void
  onError?: () => void
  className?: string
}

export function Turnstile({ onToken, onError, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Keep the latest callbacks without re-running the one-shot render effect.
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelled = false
    let widgetId: string | null = null

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => {
            onTokenRef.current('')
            onErrorRef.current?.()
          },
        })
      })
      .catch(() => onErrorRef.current?.())

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={containerRef} className={className} />
}
