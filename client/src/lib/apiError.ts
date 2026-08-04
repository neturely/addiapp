export class ApiError extends Error {
  status: number
  code?: string
  /** Extra fields the server sent beside error/message (e.g. the #319 TOTP
   *  login challenge). Untyped — narrow at the call site. */
  details?: Record<string, unknown>

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
