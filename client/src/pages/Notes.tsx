import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchNote, saveNote, NOTE_MAX_LENGTH } from '@/lib/notes'
import { useErrorReporter } from '@/toast/useErrorReporter'
import { friendlyMessage } from '@/lib/apiError'
import { Loading } from '@/components/Loading'
import { ErrorBanner } from '@/components/ErrorBanner'

/** Debounce before an autosave fires (#405). Long enough not to save every
 *  keystroke, short enough that a glance away doesn't lose the thought. */
const AUTOSAVE_MS = 1500

type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed'

/** The quiet indicator's text; '' renders nothing (the resting state). */
const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Not saved',
}

/**
 * Notes (#405) — ONE personal scratchpad page per user.
 *
 * Deliberately not a task or a document: no title, no formatting, no list. Just
 * a big plain-text field that keeps itself saved, for the jotting that doesn't
 * belong on a task's description.
 *
 * **Autosave, no Save button.** Losing jotted notes to a save you forgot to
 * press is the one failure mode a scratchpad must not have, so the page saves
 * on a debounce, on blur, and on the way out (SPA navigation and tab close).
 * The indicator is the only feedback — a toast per save would be noise on a
 * page whose whole job is to save constantly.
 */
export function Notes() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [state, setState] = useState<SaveState>('idle')
  const reportError = useErrorReporter()

  // What the server currently holds, so we never re-save unchanged text (and so
  // the unmount flush can tell whether it has anything to flush).
  const savedRef = useRef('')
  const contentRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchNote()
      .then((note) => {
        if (cancelled) return
        setContent(note.content)
        savedRef.current = note.content
        contentRef.current = note.content
      })
      .catch((err) => {
        // #415/#436: a failed load leaves the editor unrendered — an empty
        // textarea under an error banner would read as "your note is empty".
        if (!cancelled) setLoadError(friendlyMessage(err, "your note didn't load"))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const next = contentRef.current
    if (next === savedRef.current) return
    setState('saving')
    try {
      await saveNote(next)
      // Another keystroke may have landed mid-flight; only claim "Saved" when
      // what we stored is still what's on screen.
      savedRef.current = next
      setState(contentRef.current === next ? 'saved' : 'unsaved')
    } catch (err) {
      setState('failed')
      reportError(err, "your note wasn't saved")
    }
  }, [reportError])

  const onChange = (value: string) => {
    setContent(value)
    contentRef.current = value
    setState('unsaved')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_MS)
  }

  // Flush on the way out: SPA navigation (unmount) and tab close/reload. The
  // unmount save is fire-and-forget — the request outlives this component.
  useEffect(() => {
    const onHide = () => void flush()
    window.addEventListener('beforeunload', onHide)
    return () => {
      window.removeEventListener('beforeunload', onHide)
      void flush()
    }
  }, [flush])

  // Fills the shell's scrolling content pane rather than a viewport
  // calculation: the pane already has a definite height, so flex-1 + min-h-0
  // keeps the field exactly as tall as the space available at any viewport,
  // and the textarea scrolls inside it.
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-4 sm:p-6">
      <h1 className="sr-only">Notes</h1>
      {loadError && <ErrorBanner message={loadError} />}
      {loading ? (
        <Loading page />
      ) : (
        !loadError && (
          <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-surface p-4 sm:p-6">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-gray-800">Notes</span>
              {/* Polite + atomic: it changes on every save, and a screen reader
                  should get the outcome, never a running commentary. */}
              <span role="status" aria-live="polite" aria-atomic className="text-xs text-muted">
                {SAVE_LABEL[state]}
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => void flush()}
              maxLength={NOTE_MAX_LENGTH}
              aria-label="Notes"
              placeholder="Anything you want to keep — it saves itself."
              className="min-h-0 flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-gray-800 outline-none placeholder:text-muted"
            />
          </div>
        )
      )}
    </div>
  )
}
