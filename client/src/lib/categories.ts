import { apiRequest } from './api'

/**
 * A user-defined task category (#276): a lightweight custom list in the rail —
 * a second task axis beside status, mirroring the projects shape (counts,
 * palette colour) without any lifecycle machinery.
 */
export type Category = {
  id: number
  name: string
  /** Optional free-text description (#336) — the projects shape; null when none. */
  description: string | null
  /** Palette index into PROJECT_COLORS — the shared #268 palette. */
  color: number
  totalCount: number
  remainingCount: number
  createdAt: string
  updatedAt: string
}

export type CategoryInput = {
  name: string
  /** '' normalizes to NULL server-side (the projects convention). */
  description?: string
  color?: number
}

function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(path, init)
}

/** Fired after any category mutation so the rail can refetch without polling
 *  (the PROJECTS_CHANGED_EVENT pattern, #268). */
export const CATEGORIES_CHANGED_EVENT = 'addiapp:categories-changed'

export function notifyCategoriesChanged() {
  window.dispatchEvent(new Event(CATEGORIES_CHANGED_EVENT))
}

/** List the user's categories with task counts (rail entries + pickers). */
export async function fetchCategories(): Promise<Category[]> {
  const { categories } = await requestJson<{ categories: Category[] }>('/categories')
  return categories
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const { category } = await requestJson<{ category: Category }>('/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  notifyCategoriesChanged()
  return category
}

export async function updateCategory(id: number, patch: Partial<CategoryInput>): Promise<Category> {
  const { category } = await requestJson<{ category: Category }>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  notifyCategoriesChanged()
  return category
}

/** Delete a category — tasks are never deleted, they just lose the label; the
 *  response carries how many did (for the confirmation toast). */
export async function deleteCategory(id: number): Promise<{ unlabelledTasks: number }> {
  const res = await requestJson<{ unlabelledTasks: number }>(`/categories/${id}`, {
    method: 'DELETE',
  })
  notifyCategoriesChanged()
  return res
}
