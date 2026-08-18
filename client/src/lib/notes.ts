import { apiRequest } from './api'

/**
 * The user's notes scratchpad (#405): ONE free-text page per user, so there is
 * no id and no list — just the content and when it was last stored. A user who
 * has never written anything reads back empty content, not a 404.
 */
export type Note = {
  content: string
  /** null until the first save. */
  updatedAt: string | null
}

/** Mirrors NotesController::MAX_LENGTH — the server is authoritative (#405). */
export const NOTE_MAX_LENGTH = 100000

export function fetchNote(): Promise<Note> {
  return apiRequest<Note>('/notes')
}

/** Upsert the whole page; returns the stored note (incl. the new updatedAt). */
export function saveNote(content: string): Promise<Note> {
  return apiRequest<Note>('/notes', { method: 'PUT', body: JSON.stringify({ content }) })
}
