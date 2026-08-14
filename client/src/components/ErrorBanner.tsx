/**
 * Page-level error card (#415 review rounds): a rounded red panel at the top of
 * the content column — the treatment for a failure that broke the whole surface
 * (a list that didn't load), where a small line of red text read as an
 * afterthought and several sites had drifted onto raw `text-red-600` instead of
 * the palette.
 *
 * `bg-danger` + white text is deliberate and measured: white on `--color-danger`
 * is 4.83:1 (see index.css), the one vivid fill where even normal-size white
 * clears AA — so this does NOT need the large/bold text-on-vivid exemption.
 *
 * It sits INSIDE the host surface's `p-4 sm:p-6` padding (the full-bleed band
 * was tried first and rejected on review), so it lines up with the toolbar and
 * list panels below and takes the same 12px panel radius as those (`rounded-xl`,
 * the repo radius scale). The message is centred and carries no icon (review
 * rounds) — the solid red field is already the signal. Render it as the first
 * child of that padded container. Field- and section-level validation messages
 * stay inline next to their control — this is for surface-wide failures only.
 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-xl bg-danger px-4 py-3 text-center text-sm font-medium text-white sm:mb-4"
    >
      {message}
    </div>
  )
}
