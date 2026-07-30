/**
 * Shared button system (#258). Filled variants sit on the `-deep` fills, where
 * normal-size white text clears WCAG AA 4.5:1 (measured in index.css) — this
 * replaces both the per-page `cta` class strings and the old rule that primary
 * CTAs must be `text-xl font-bold` for white to pass on the vivid fills.
 *
 * Use the `Button` component for real <button>s; use `buttonClasses` directly
 * for non-button elements styled as buttons (e.g. a react-router <Link>).
 * (Separate file from Button.tsx so the component file only exports components
 * — react-refresh constraint.)
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger'
export type ButtonSize = 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary-deep font-semibold text-white hover:bg-primary-deep-hover',
  success: 'bg-success-deep font-semibold text-white hover:bg-success-deep-hover',
  danger: 'bg-danger-deep font-semibold text-white hover:bg-danger-deep-hover',
  secondary: 'bg-field font-medium text-gray-700 hover:bg-field-hover',
  ghost: 'font-medium text-muted hover:bg-field hover:text-gray-700',
}

const SIZE: Record<ButtonSize, string> = {
  md: 'h-9 rounded-lg px-3.5 text-sm',
  lg: 'h-[42px] rounded-control px-5 text-[15px]',
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
): string {
  return [
    'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap transition',
    'disabled:cursor-not-allowed disabled:bg-field disabled:text-gray-400',
    VARIANT[variant],
    SIZE[size],
    className,
  ]
    .filter(Boolean)
    .join(' ')
}
