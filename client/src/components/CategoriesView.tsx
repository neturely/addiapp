import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Pencil, Tag } from 'lucide-react'
import { CATEGORIES_CHANGED_EVENT, fetchCategories, type Category } from '@/lib/categories'
import { projectHex } from '@/lib/projectColors'
import { Mascot } from '@/components/Mascot'
import { Loading } from '@/components/Loading'

/**
 * The categories view (#336) — `?view=categories`, reached from the rail's
 * Categories heading: every category as a Dashboard-style row (tag icon in
 * the category's colour · bold name + muted description · remaining count ·
 * trailing edit pencil). A row opens the category's task list; the pencil
 * deep-links the edit modal on top of it — the same two destinations as the
 * rail entries. (A shared row/card chrome across the tasks/projects/
 * categories views is a filed follow-up.)
 */
export function CategoriesView() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[] | null>(null)

  // Fetch on mount + the mutation signal (the rail's freshness pattern) — an
  // edit/delete lands back here without a route change.
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const bump = () => setRefresh((n) => n + 1)
    window.addEventListener(CATEGORIES_CHANGED_EVENT, bump)
    return () => window.removeEventListener(CATEGORIES_CHANGED_EVENT, bump)
  }, [])
  useEffect(() => {
    let cancelled = false
    fetchCategories()
      .then((c) => !cancelled && setCategories(c))
      .catch(() => !cancelled && setCategories([]))
    return () => {
      cancelled = true
    }
  }, [refresh])

  return (
    <section aria-label="Categories">
      <div className="mb-2.5 flex items-center gap-2.5 px-1 text-xs text-muted">Categories</div>

      {categories === null ? (
        <Loading />
      ) : categories.length === 0 ? (
        <div className="rounded-xl bg-surface p-10 text-center">
          {/* Shared "nothing to see here" treatment (#256 review). */}
          <Mascot expression="empty" className="mx-auto mb-4 h-20 w-20" />
          <p className="text-muted">
            No categories yet — use the + beside Categories in the sidebar to make one.
          </p>
        </div>
      ) : (
        <ul aria-label="Categories" className="flex flex-col gap-px">
          {categories.map((c, i) => (
            <li
              key={c.id}
              className={`group flex h-12 items-center bg-surface transition hover:bg-[#fbf8f3] ${
                i === 0 ? 'rounded-t-xl' : ''
              } ${i === categories.length - 1 ? 'rounded-b-xl' : ''}`}
            >
              <span className="ml-5 flex h-full w-3.5 flex-none items-center" aria-hidden>
                <Tag
                  className="h-3.5 w-3.5"
                  style={{ color: projectHex(c.color) }}
                  strokeWidth={2.25}
                />
              </span>
              <button
                type="button"
                onClick={() => navigate(`/dashboard?category=${c.id}`)}
                aria-label={`Open ${c.name}`}
                className="flex h-full min-w-0 flex-1 items-center gap-3.5 pl-3.5 pr-5 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-semibold text-gray-800">{c.name}</span>
                  {c.description && <span className="text-muted"> {c.description}</span>}
                </span>
                <span className="flex-none text-xs tabular-nums text-muted">
                  {c.remainingCount} of {c.totalCount} left to do
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/dashboard?category=${c.id}&editCategory=1`)}
                aria-label={`Edit category ${c.name}`}
                className="mr-3 inline-flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted transition hover:bg-field-hover hover:text-primary-ink sm:h-9 sm:w-9"
              >
                <Pencil className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
