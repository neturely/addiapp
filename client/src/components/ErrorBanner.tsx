import { CircleAlert } from 'lucide-react'

/**
 * Page-level error bar (#415 review round): a full-bleed red band across the
 * top of the content area, directly under the header — the treatment for a
 * failure that broke the whole surface (a list that didn't load), where a small
 * line of red text read as an afterthought and several sites had drifted onto
 * raw `text-red-600` instead of the palette.
 *
 * `bg-danger` + white text is deliberate and measured: white on `--color-danger`
 * is 4.83:1 (see index.css), the one vivid fill where even normal-size white
 * clears AA — so this does NOT need the large/bold text-on-vivid exemption.
 *
 * The bleed margins cancel the host surface's `p-4 sm:p-6` padding, so the bar
 * spans edge to edge; render it as the FIRST child of that padded container.
 * Field- and section-level validation messages stay inline next to their
 * control — this is for surface-wide failures only.
 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="-mx-4 -mt-4 mb-4 flex items-start gap-2.5 bg-danger px-4 py-3 text-sm font-medium text-white sm:-mx-6 sm:-mt-6 sm:mb-5 sm:px-6"
    >
      <CircleAlert className="mt-px h-4 w-4 flex-none" strokeWidth={2.5} aria-hidden />
      <span className="min-w-0">{message}</span>
    </div>
  )
}
