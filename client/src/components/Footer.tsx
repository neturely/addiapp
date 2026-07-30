/**
 * Thin utility footer (#260). Logout moved to the Header avatar menu; legal/
 * about links are deliberately absent until those pages exist (#40, open
 * Privacy/ToS decisions — epic #256 dropped the prototype's placeholder links).
 */
export function Footer() {
  return (
    <footer className="flex flex-none items-center justify-between px-4 py-2 text-xs text-muted">
      <span>© {new Date().getFullYear()} Neturely</span>
      <span>AddiApp</span>
    </footer>
  )
}
